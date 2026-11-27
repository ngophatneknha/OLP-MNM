# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# Bảng lakehouse Apache Iceberg cho kho lạnh: các tệp JSONL trong S3 (bucket dxlab-cold) được nạp vào bảng Iceberg `cold.submission`,
# dữ liệu là tệp Parquet nằm cạnh trong cùng S3 (thư mục lake/), danh mục (catalog) Iceberg nằm trong schema `iceberg` của PostgreSQL.
#   sync                 nạp các tệp JSONL chưa nạp (chạy lại không nhân đôi); trường mới trong `data` thì thêm cột: lược đồ lên phiên bản
#   info                 lược đồ hiện tại, các phiên bản lược đồ và các ảnh chụp (snapshot)
#   sql "<câu>" [snap]   SQL (DuckDB) trên bảng `lake`; có snap thì đọc đúng ảnh chụp đó (du hành thời gian)
#   expire [ngày]        xóa ảnh chụp cũ hơn N ngày (mặc định LAKE_SNAPSHOT_DAYS=30) và các tệp không còn ảnh chụp nào dùng
#   compact              gộp tệp Parquet nhỏ: ghi lại cả bảng thành ít tệp (một ảnh chụp mới, ảnh cũ vẫn đọc được tới khi expire)
#   forget <mã hồ sơ>    xóa hẳn một hồ sơ (quyền xóa dữ liệu cá nhân): bỏ hàng, xóa MỌI ảnh chụp cũ và tệp cũ còn chứa hàng đó,
#                        ghi dấu băm của mã để lần nạp sau không nạp lại từ tệp JSONL
# Dùng qua scripts/lake.sh. Mỗi trường của hồ sơ thành cột `data_<mã>`; kiểu suy từ giá trị JSON, không suy từ nội dung chuỗi:
# số -> double, đúng/sai -> boolean, còn lại -> chuỗi. Vì vậy "8" (chuỗi) và 8 (số) là hai kiểu khác nhau: tệp có giá trị trái kiểu
# cột đã có bị bỏ qua cả tệp và báo, để bảng không bị trộn kiểu. Nạp lại không nhân đôi: tệp đã nạp nhận ra qua cột object_key.
# Lệnh ghi (sync, expire, compact, forget) giữ khóa pg_try_advisory_lock trong PostgreSQL: hai lệnh ghi cùng lúc thì lệnh sau dừng ngay.
# Ảnh chụp giữ lại để du hành thời gian nhưng vẫn chứa dữ liệu cũ, nên đặt hạn giữ (expire chạy định kỳ) và forget xóa cả ảnh cũ.
# shortcut: chạy bằng quyền vận hành, không theo token người dùng; forget chỉ xóa trong bảng Iceberg, tệp JSONL gốc của kho lạnh
# (dữ liệu chỉ thêm, có sổ cái băm) phải xử lý theo quy trình của kho lạnh; compact ghi lại cả bảng nên chỉ hợp bảng vừa và nhỏ.
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timedelta, timezone

import duckdb
import pyarrow as pa
import pyarrow.fs as pafs
import pg8000.native
from pyiceberg.catalog.sql import SqlCatalog
from pyiceberg.exceptions import NoSuchTableError
from pyiceberg.expressions import EqualTo
from pyiceberg.partitioning import PartitionField, PartitionSpec
from pyiceberg.schema import Schema
from pyiceberg.transforms import IdentityTransform
from pyiceberg.types import BooleanType, DoubleType, IntegerType, LongType, NestedField, StringType, TimestamptzType

BUCKET = "dxlab-cold"
TABLE = "cold.submission"
ENDPOINT = os.environ.get("S3_ENDPOINT", "seaweedfs:8333")
S3 = {"s3.endpoint": f"http://{ENDPOINT}", "s3.access-key-id": os.environ["S3_ACCESS_KEY"], "s3.secret-access-key": os.environ["S3_SECRET_KEY"], "s3.region": "us-east-1"}
FIELD = re.compile(r"^[a-z][a-z0-9_]{0,60}$")
FORGOTTEN = "dxlab.forgotten"  # thuộc tính bảng: băm sha256 của mã hồ sơ đã xóa theo yêu cầu, cách nhau dấu phẩy

# Cột cố định, khớp bảng submission khi xuất kho lạnh (xem infra/duckdb/query.py); id cột Iceberg không đổi giữa các phiên bản lược đồ.
BASE = [
    ("id", StringType()), ("no", LongType()), ("app_key", StringType()), ("app_version", IntegerType()), ("status", StringType()),
    ("current_step", StringType()), ("waiting_role", StringType()), ("submitter_id", StringType()), ("submitter_name", StringType()),
    ("created_at", TimestamptzType()), ("finished_at", TimestamptzType()), ("org", StringType()), ("object_key", StringType()),
    ("data", StringType()), ("events", StringType()),
]
ARROW = {StringType: pa.string(), LongType: pa.int64(), IntegerType: pa.int32(), DoubleType: pa.float64(), BooleanType: pa.bool_(), TimestamptzType: pa.timestamp("us", tz="UTC")}


def pg_conn():
    return pg8000.native.Connection(os.environ["POSTGRES_USER"], password=os.environ["POSTGRES_PASSWORD"], host=os.environ.get("POSTGRES_HOST", "postgres"), database=os.environ["POSTGRES_DB"])


def lock():
    """Khóa tư vấn (advisory lock) của PostgreSQL cho lệnh ghi; giữ tới khi tiến trình thoát. Đang có lệnh ghi khác thì dừng."""
    con = pg_conn()
    if not con.run("SELECT pg_try_advisory_lock(hashtext('dxlab-lake'))")[0][0]:
        sys.exit("Đang có lệnh lake.sh khác ghi bảng Iceberg (pg_advisory_lock), thử lại sau")
    return con


def fs_s3():
    return pafs.S3FileSystem(endpoint_override=ENDPOINT, scheme="http", access_key=S3["s3.access-key-id"], secret_key=S3["s3.secret-access-key"], region="us-east-1")


def digest(submission_id):
    return hashlib.sha256(submission_id.encode()).hexdigest()


def forgotten(tbl):
    return set(filter(None, tbl.properties.get(FORGOTTEN, "").split(",")))


def catalog():
    pg = f"postgresql+pg8000://{os.environ['POSTGRES_USER']}:{os.environ['POSTGRES_PASSWORD']}@{os.environ.get('POSTGRES_HOST', 'postgres')}/{os.environ['POSTGRES_DB']}"
    return SqlCatalog("dxlab", uri=pg, warehouse=f"s3://{BUCKET}/lake", **S3, **{"init_catalog_tables": "true"})


def table(cat):
    try:
        return cat.load_table(TABLE)
    except NoSuchTableError:
        cat.create_namespace_if_not_exists("cold")
        schema = Schema(*[NestedField(i + 1, name, typ, required=False) for i, (name, typ) in enumerate(BASE)])
        org = schema.find_field("org").field_id
        spec = PartitionSpec(PartitionField(source_id=org, field_id=1000, transform=IdentityTransform(), name="org"))  # mỗi tổ chức một thư mục
        return cat.create_table(TABLE, schema=schema, partition_spec=spec, properties={"format-version": "2"})


def kind(value):
    """Kiểu Iceberg suy từ một giá trị JSON; None thì chưa biết."""
    if value is None:
        return None
    if isinstance(value, bool):
        return BooleanType()
    if isinstance(value, (int, float)):
        return DoubleType()
    return StringType()


def ts(v):
    return datetime.fromisoformat(v.replace("Z", "+00:00")) if v else None


def parse(fs, path):
    """Đọc một tệp JSONL -> danh sách dòng; dòng hỏng thì cả tệp coi là hỏng (tệp kho lạnh được ghi một lần, có mã băm)."""
    with fs.open_input_stream(path) as f:
        text = f.read().decode("utf-8")
    rows = [json.loads(line) for line in text.splitlines() if line.strip()]
    for r in rows:
        if not isinstance(r, dict) or not isinstance(r.get("id"), str) or not isinstance(r.get("data", {}), dict):
            raise ValueError("dòng không đúng dạng hồ sơ")
    return rows


def sync():
    held = lock()  # noqa: F841 (giữ kết nối để giữ khóa)
    cat = catalog()
    tbl = table(cat)
    fs = fs_s3()
    gone = forgotten(tbl)
    files = sorted(i.path for i in fs.get_file_info(pafs.FileSelector(BUCKET, recursive=True)) if i.path.endswith(".jsonl") and not i.path.startswith(f"{BUCKET}/lake/"))
    done = set(tbl.scan(selected_fields=("object_key",)).to_arrow().column("object_key").to_pylist()) if tbl.current_snapshot() else set()
    report = {"loaded_files": 0, "rows": 0, "skipped": [], "added_columns": []}
    for path in files:
        key = path[len(BUCKET) + 1:]
        if key in done:
            continue
        try:
            rows = parse(fs, path)
        except (ValueError, UnicodeDecodeError) as err:
            report["skipped"].append({"object_key": key, "reason": f"tệp hỏng: {str(err).splitlines()[0][:120]}"})
            continue
        rows = [r for r in rows if digest(r["id"]) not in gone]  # hồ sơ đã xóa theo yêu cầu thì không nạp lại
        if not rows:
            report["skipped"].append({"object_key": key, "reason": "mọi hồ sơ trong tệp đã bị xóa theo yêu cầu (forget)"})
            continue
        current = {f.name: f.field_type for f in tbl.schema().fields}
        new, conflict = {}, None
        for r in rows:
            for k, v in r.get("data", {}).items():
                t = kind(v)
                col = f"data_{k}"
                if t is None or not FIELD.match(k):
                    continue
                have = current.get(col) or new.get(col)
                if have is None:
                    new[col] = t
                elif type(have) is not type(t):
                    conflict = f"trường {k}: giá trị kiểu {t} không khớp cột {col} kiểu {have}"
        if conflict:
            report["skipped"].append({"object_key": key, "reason": f"lược đồ không tương thích, {conflict}"})
            continue
        if new:
            with tbl.update_schema() as upd:  # mỗi lần thêm cột là một phiên bản lược đồ mới (schema-id tăng)
                for col, t in new.items():
                    upd.add_column(col, t, doc="trường dữ liệu của hồ sơ, thêm tự động khi nạp")
            report["added_columns"] += list(new)
            tbl = cat.load_table(TABLE)
        fields = tbl.schema().fields
        org = key.split("/")[0]
        cols = {f.name: [] for f in fields}
        for r in rows:
            data = r.get("data") or {}
            for f in fields:
                n = f.name
                if n.startswith("data_"):
                    v = data.get(n[5:])
                    cols[n].append(None if v is None else float(v) if isinstance(f.field_type, DoubleType) else v if isinstance(f.field_type, BooleanType) else v if isinstance(v, str) else json.dumps(v, ensure_ascii=False))
                elif n in ("created_at", "finished_at"):
                    cols[n].append(ts(r.get(n)))
                elif n == "org":
                    cols[n].append(org)
                elif n == "object_key":
                    cols[n].append(key)
                elif n in ("data", "events"):
                    cols[n].append(json.dumps(r.get(n), ensure_ascii=False) if r.get(n) is not None else None)
                else:
                    cols[n].append(r.get(n))
        arrow = pa.table({f.name: pa.array(cols[f.name], type=ARROW[type(f.field_type)]) for f in fields})
        tbl.append(arrow, snapshot_properties={"dxlab.object_key": key})
        report["loaded_files"] += 1
        report["rows"] += len(rows)
    report["schema_id"] = tbl.schema().schema_id
    return report


def info():
    tbl = table(catalog())
    md = tbl.metadata
    return {
        "table": TABLE, "format_version": md.format_version, "schema_id": md.current_schema_id,
        "schemas": [{"schema_id": s.schema_id, "columns": [f.name for f in s.fields]} for s in md.schemas],
        "snapshots": [{"snapshot_id": str(s.snapshot_id),  # chuỗi: số 64 bit vượt độ chính xác của số JSON trong JavaScript
                        "schema_id": s.schema_id, "at": datetime.fromtimestamp(s.timestamp_ms / 1000).isoformat(), "summary": s.summary.additional_properties if s.summary else {}} for s in md.snapshots],
        "partition": [f.name for f in tbl.spec().fields],
    }


def live_files(tbl):
    """Mọi tệp mà siêu dữ liệu hiện tại còn dùng: tệp metadata hiện tại, danh sách manifest, manifest, tệp dữ liệu của mọi ảnh chụp còn giữ."""
    io = tbl.io
    keep = {tbl.metadata_location}
    for snap in tbl.metadata.snapshots:
        keep.add(snap.manifest_list)
        for m in snap.manifests(io):
            keep.add(m.manifest_path)
            keep.update(e.data_file.file_path for e in m.fetch_manifest_entry(io, discard_deleted=True))
    return {k.split("://", 1)[-1] for k in keep}


def purge(tbl):
    """Xóa tệp trong thư mục bảng không còn ảnh chụp nào dùng (gồm cả tệp metadata cũ, vốn trỏ tới ảnh chụp đã xóa)."""
    fs = fs_s3()
    keep = live_files(tbl)
    base = tbl.location().split("://", 1)[-1]
    removed = 0
    for info in fs.get_file_info(pafs.FileSelector(base, recursive=True, allow_not_found=True)):
        if info.type == pafs.FileType.File and info.path not in keep:
            fs.delete_file(info.path)
            removed += 1
    return removed


def expire(days=None):
    held = lock()  # noqa: F841
    cat = catalog()
    tbl = table(cat)
    days = float(days if days is not None else os.environ.get("LAKE_SNAPSHOT_DAYS", "30"))
    cutoff = datetime.now(timezone.utc) - timedelta(days=days)
    current = tbl.current_snapshot().snapshot_id if tbl.current_snapshot() else None
    old = [s.snapshot_id for s in tbl.metadata.snapshots if s.snapshot_id != current and s.timestamp_ms < cutoff.timestamp() * 1000]
    if old:
        tbl.maintenance.expire_snapshots().by_ids(old).commit()
        tbl = cat.load_table(TABLE)
    return {"expired_snapshots": len(old), "kept_snapshots": len(tbl.metadata.snapshots), "removed_files": purge(tbl), "older_than": cutoff.isoformat()}


def compact():
    held = lock()  # noqa: F841
    cat = catalog()
    tbl = table(cat)
    if not tbl.current_snapshot():
        return {"files_before": 0, "files_after": 0}
    count = lambda t: len(list(t.scan().plan_files()))  # noqa: E731
    before = count(tbl)
    tbl.overwrite(tbl.scan().to_arrow(), snapshot_properties={"dxlab.operation": "compact"})
    tbl = cat.load_table(TABLE)
    return {"files_before": before, "files_after": count(tbl), "snapshot_id": str(tbl.current_snapshot().snapshot_id)}


def forget(submission_id):
    """Xóa hẳn một hồ sơ khỏi bảng: hàng hiện tại, mọi ảnh chụp cũ (vẫn chứa hàng) và tệp không còn dùng; ghi dấu băm để không nạp lại."""
    held = lock()  # noqa: F841
    cat = catalog()
    tbl = table(cat)
    with tbl.transaction() as tx:
        tx.set_properties({FORGOTTEN: ",".join(sorted(forgotten(tbl) | {digest(submission_id)}))})
    tbl = cat.load_table(TABLE)
    found = tbl.scan(row_filter=EqualTo("id", submission_id), selected_fields=("id",)).to_arrow().num_rows if tbl.current_snapshot() else 0
    if found:
        tbl.delete(delete_filter=EqualTo("id", submission_id), snapshot_properties={"dxlab.operation": "forget"})
        tbl = cat.load_table(TABLE)
    current = tbl.current_snapshot().snapshot_id if tbl.current_snapshot() else None
    old = [s.snapshot_id for s in tbl.metadata.snapshots if s.snapshot_id != current]
    if old:
        tbl.maintenance.expire_snapshots().by_ids(old).commit()
        tbl = cat.load_table(TABLE)
    return {"deleted_rows": found, "expired_snapshots": len(old), "removed_files": purge(tbl)}


def query(sql, snapshot=None):
    tbl = table(catalog())
    scan = tbl.scan(snapshot_id=int(snapshot)) if snapshot else tbl.scan()
    lake = scan.to_arrow() if tbl.current_snapshot() else pa.table({f.name: pa.array([], type=ARROW[type(f.field_type)]) for f in tbl.schema().fields})
    con = duckdb.connect()
    con.register("lake", lake)
    cur = con.execute(sql)
    cols = [d[0] for d in cur.description]
    return [dict(zip(cols, row)) for row in cur.fetchall()]


if __name__ == "__main__":
    cmd, *args = sys.argv[1:] or [""]
    if cmd == "sync":
        out = sync()
    elif cmd == "info":
        out = info()
    elif cmd == "sql" and args:
        out = query(args[0], args[1] if len(args) > 1 else None)
    elif cmd == "expire":
        out = expire(args[0] if args else None)
    elif cmd == "compact":
        out = compact()
    elif cmd == "forget" and args and re.match(r"^[0-9a-f-]{36}$", args[0]):
        out = forget(args[0])
    else:
        sys.exit('Dùng: lake.sh sync | info | sql "SELECT ... FROM lake" [snapshot_id] | expire [ngày] | compact | forget <mã hồ sơ>')
    print(json.dumps(out, ensure_ascii=False, default=str, indent=1))
