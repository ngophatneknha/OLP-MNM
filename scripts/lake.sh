#!/bin/sh
# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# Bảng lakehouse Apache Iceberg của kho lạnh (profile lakehouse, cùng ảnh với cold-sql.sh). In kết quả dạng JSON.
#   sh scripts/lake.sh sync                                   nạp tệp JSONL mới của kho lạnh vào bảng cold.submission
#   sh scripts/lake.sh info                                   phiên bản lược đồ và ảnh chụp (snapshot)
#   sh scripts/lake.sh sql "SELECT org, count(*) FROM lake GROUP BY ALL" [snapshot_id]
# Chi tiết: docs/VAN_HANH.md, mục Bảng Iceberg.
set -eu
cd "$(dirname "$0")/.."
compose="docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile lakehouse"
$compose build -q lakehouse >&2
exec $compose run --rm -T --no-deps --entrypoint python lakehouse /lake.py "$@"
