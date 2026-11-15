# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
FROM python:3.12-slim
RUN pip install --no-cache-dir duckdb==1.1.3
COPY query.py /query.py
ENTRYPOINT ["python", "/query.py"]
