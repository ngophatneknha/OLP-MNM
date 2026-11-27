# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# Bảng lakehouse Apache Iceberg cho kho lạnh: các tệp JSONL trong S3 (bucket dxlab-cold) được nạp vào bảng Iceberg `cold.submission`,
# dữ liệu là tệp Parquet nằm cạnh trong cùng S3 (thư mục lake/), danh mục (catalog) Iceberg nằm trong schema `iceberg` của PostgreSQL.
#   sync                 nạp các tệp JSONL chưa nạp (chạy lại không nhân đôi); trường mới trong `data` thì thêm cột: lược đồ lên phiên bản
#   info                 lược đồ hiện tại, các phiên bản lược đồ và các ảnh chụp (snapshot)
#   sql "<câu>" [snap]   SQL (DuckDB) trên bảng `lake`; có snap thì đọc đúng ảnh chụp đó (du hành thời gian)
# Dùng qua scripts/lake.sh. Mỗi trường của hồ sơ thành cột `data_<mã>`; kiểu suy từ giá trị: số -> double, đúng/sai -> boolean, còn lại -> chuỗi.
# Tệp có giá trị trái kiểu cột đã có (ví dụ chữ vào cột số) bị bỏ qua cả tệp và báo, để bảng không bị trộn kiểu.
# shortcut: một tiến trình ghi tại một thời điểm (danh mục SQL không khóa lạc quan giữa nhiều người ghi); chưa có gộp tệp nhỏ (compaction)
# hay xóa ảnh chụp cũ; chạy bằng quyền vận hành, không theo token người dùng.
import json
import os
import re
import sys
from datetime import datetime

import duckdb
import pyarrow as pa
import pyarrow.fs as pafs
from pyiceberg.catalog.sql import SqlCatalog
from pyiceberg.exceptions import NoSuchTableError
from pyiceberg.partitioning import PartitionField, PartitionSpec
from pyiceberg.schema import Schema
from pyiceberg.transforms import IdentityTransform
from pyiceberg.types import BooleanType, DoubleType, IntegerType, LongType, NestedField, StringType, TimestamptzType

BUCKET = "dxlab-cold"
TABLE = "cold.submission"
ENDPOINT = os.environ.get("S3_ENDPOINT", "seaweedfs:8333")
S3 = {"s3.endpoint": f"http://{ENDPOINT}", "s3.access-key-id": os.environ["S3_ACCESS_KEY"], "s3.secret-access-key": os.environ["S3_SECRET_KEY"], "s3.region": "us-east-1"}
FIELD = re.compile(r"^[a-z][a-z0-9_]{0,60}$")

# Cột cố định, khớp bảng submission khi xuất kho lạnh (xem infra/duckdb/query.py); id cột Iceberg không đổi giữa các phiên bản lược đồ.
BASE = [
    ("id", StringType()), ("no", LongType()), ("app_key", StringType()), ("app_version", IntegerType()), ("status", StringType()),
    ("current_step", StringType()), ("waiting_role", StringType()), ("submitter_id", StringType()), ("submitter_name", StringType()),
    ("created_at", TimestamptzType()), ("finished_at", TimestamptzType()), ("org", StringType()), ("object_key", StringType()),
    ("data", StringType()), ("events", StringType()),
]
ARROW = {StringType: pa.string(), LongType: pa.int64(), IntegerType: pa.int32(), DoubleType: pa.float64(), BooleanType: pa.bool_(), TimestamptzType: pa.timestamp("us", tz="UTC")}


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
    cat = catalog()
    tbl = table(cat)
    fs = pafs.S3FileSystem(endpoint_override=ENDPOINT, scheme="http", access_key=S3["s3.access-key-id"], secret_key=S3["s3.secret-access-key"], region="us-east-1")
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
    else:
        sys.exit('Dùng: lake.sh sync | lake.sh info | lake.sh sql "SELECT ... FROM lake" [snapshot_id]')
    print(json.dumps(out, ensure_ascii=False, default=str, indent=1))
