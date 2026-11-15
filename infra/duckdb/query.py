# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# SQL trực tiếp trên kho lạnh (lakehouse nhẹ): DuckDB đọc các tệp JSONL trong S3 (SeaweedFS) bằng SigV4,
# không cần nạp lại vào PostgreSQL. Bảng ảo `cold` có mọi cột của hồ sơ, thêm `events` (danh sách sự kiện),
# `org` (tổ chức, lấy từ tiền tố khóa đối tượng) và `object_key`.
# Dùng: sh scripts/cold-sql.sh "SELECT org, status, count(*) FROM cold GROUP BY ALL"
# Dòng hỏng (ví dụ tệp bị sửa) bị bỏ qua thay vì làm hỏng cả truy vấn; dùng GET /archive/verify để phát hiện sửa đổi.
# shortcut: tệp JSONL, không phải bảng Parquet/Iceberg (không có lược đồ phiên bản hay phân vùng); chạy bằng quyền vận hành, không theo token người dùng.
import json
import os
import sys

import duckdb

BUCKET = "dxlab-cold"
con = duckdb.connect()
con.execute("INSTALL httpfs; LOAD httpfs;")
q = lambda v: "'" + v.replace("'", "''") + "'"  # CREATE SECRET không nhận tham số, nên tự bọc chuỗi
con.execute(
    f"CREATE SECRET s3 (TYPE S3, KEY_ID {q(os.environ['S3_ACCESS_KEY'])}, SECRET {q(os.environ['S3_SECRET_KEY'])}, "
    f"ENDPOINT {q(os.environ.get('S3_ENDPOINT', 'seaweedfs:8333'))}, URL_STYLE 'path', USE_SSL false, REGION 'us-east-1')"
)
# Cột khai báo sẵn (không dò lược đồ) để một tệp hỏng không làm hỏng cả truy vấn; khớp bảng submission cộng events.
COLUMNS = "{id: 'UUID', no: 'BIGINT', app_key: 'VARCHAR', app_version: 'INTEGER', data: 'JSON', status: 'VARCHAR', current_step: 'VARCHAR', waiting_role: 'VARCHAR', submitter_id: 'VARCHAR', submitter_name: 'VARCHAR', created_at: 'TIMESTAMPTZ', finished_at: 'TIMESTAMPTZ', org_id: 'VARCHAR', events: 'JSON'}"
READ = f"filename = true, format = 'newline_delimited', columns = {COLUMNS}"
good = []
for (f,) in con.execute(f"SELECT file FROM glob('s3://{BUCKET}/**/*.jsonl')").fetchall():
    try:
        con.execute(f"SELECT count(*) FROM read_json({q(f)}, {READ})").fetchall()
        good.append(f)
    except duckdb.Error as err:  # tệp hỏng hoặc bị sửa: bỏ qua và báo, để truy vấn vẫn chạy
        print(f"Bỏ qua tệp hỏng {f}: {str(err).splitlines()[0]}", file=sys.stderr)
if not good:
    sys.exit("Kho lạnh chưa có tệp nào để truy vấn (chạy POST /archive trước).")
con.execute(
    f"""CREATE VIEW cold AS
    SELECT split_part(filename, '/', 4) AS org, substr(filename, length('s3://{BUCKET}/') + 1) AS object_key, * EXCLUDE (filename)
    FROM read_json([{", ".join(q(f) for f in good)}], {READ})"""
)
sql = " ".join(sys.argv[1:]).strip()
if not sql:
    sys.exit("Dùng: cold-sql.sh \"SELECT ... FROM cold\"")
cur = con.execute(sql)
cols = [d[0] for d in cur.description]
print(json.dumps([dict(zip(cols, row)) for row in cur.fetchall()], ensure_ascii=False, default=str, indent=1))
