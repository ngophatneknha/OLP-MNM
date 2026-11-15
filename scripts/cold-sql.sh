#!/bin/sh
# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# SQL trên kho lạnh bằng DuckDB (profile lakehouse; lần đầu sẽ dựng ảnh nhỏ có DuckDB). In kết quả dạng JSON.
#   sh scripts/cold-sql.sh "SELECT org, status, count(*) AS n FROM cold GROUP BY ALL"
# Bảng ảo `cold`: mọi cột của hồ sơ đã xuất, thêm org, object_key, events. Chi tiết: docs/VAN_HANH.md.
set -eu
cd "$(dirname "$0")/.."
compose="docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile lakehouse"
$compose build -q lakehouse >&2  # đã dựng thì gần như tức thì; tiến trình dựng đi ra stderr để stdout chỉ có JSON
exec $compose run --rm -T --no-deps lakehouse "$@"
