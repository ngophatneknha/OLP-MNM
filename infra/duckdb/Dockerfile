# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
# DuckDB (MIT) cho SQL trên tệp JSONL của kho lạnh; PyIceberg, PyArrow (Apache-2.0), SQLAlchemy (MIT), pg8000 (BSD-3-Clause) cho bảng Iceberg.
FROM python:3.12-slim
RUN pip install --no-cache-dir duckdb==1.1.3 pyiceberg==0.10.0 pyarrow==21.0.0 sqlalchemy==2.0.45 pg8000==1.31.2
COPY query.py lake.py /
ENTRYPOINT ["python", "/query.py"]
