#!/bin/sh
# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# Bảng lakehouse Apache Iceberg của kho lạnh (profile lakehouse, cùng ảnh với cold-sql.sh). In kết quả dạng JSON.
#   sh scripts/lake.sh sync                                   nạp tệp JSONL mới của kho lạnh vào bảng cold.submission
#   sh scripts/lake.sh info                                   phiên bản lược đồ và ảnh chụp (snapshot)
#   sh scripts/lake.sh sql "SELECT org, count(*) FROM lake GROUP BY ALL" [snapshot_id]
#   sh scripts/lake.sh expire [ngày]                          xóa ảnh chụp cũ (mặc định LAKE_SNAPSHOT_DAYS=30) và tệp không còn dùng
#   sh scripts/lake.sh compact                                gộp tệp Parquet nhỏ
#   sh scripts/lake.sh forget <mã hồ sơ>                      xóa hẳn một hồ sơ, kể cả trong ảnh chụp cũ (quyền xóa dữ liệu cá nhân)
# Chi tiết: docs/VAN_HANH.md, mục Bảng Iceberg.
set -eu
cd "$(dirname "$0")/.."
compose="docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile lakehouse"
$compose build -q lakehouse >&2
exec $compose run --rm -T --no-deps --entrypoint python lakehouse /lake.py "$@"
