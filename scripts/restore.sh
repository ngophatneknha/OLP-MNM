#!/bin/sh
# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# Khôi phục từ thư mục do scripts/backup.sh tạo. GHI ĐÈ dữ liệu hiện tại.
# Dùng: sh scripts/restore.sh <thư-mục-sao-lưu>
set -eu
cd "$(dirname "$0")/.."
[ -n "${1:-}" ] || { echo "Dùng: sh scripts/restore.sh <thư-mục-sao-lưu>" >&2; exit 2; }
dir="$1"
[ -f "$dir/SHA256SUMS" ] || { echo "Thiếu $dir/SHA256SUMS: không phải thư mục sao lưu hợp lệ" >&2; exit 2; }
( cd "$dir" && sha256sum -c SHA256SUMS ) || { echo "Tệp sao lưu bị hỏng, dừng." >&2; exit 1; }
[ -f .env ] && set -a && . ./.env && set +a

# Dừng mọi dịch vụ đang dùng dữ liệu, chỉ để PostgreSQL chạy.
docker compose stop apisix web workflow-bridge hasura hasura-init flowable keycloak seaweedfs
for db in dxlab keycloak flowable; do
  docker compose exec -T postgres psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 -c "DROP DATABASE IF EXISTS $db WITH (FORCE)" -c "CREATE DATABASE $db"
  gunzip -c "$dir/$db.sql.gz" | docker compose exec -T postgres psql -U "$POSTGRES_USER" -d "$db" -v ON_ERROR_STOP=1 -q -o /dev/null
done
# Bản sao lưu tự động theo lịch (dịch vụ backup) chỉ có CSDL, không có kho tệp: bỏ qua bước trả kho tệp.
if [ -f "$dir/s3data.tar.gz" ]; then
  docker compose run --rm --no-deps -T --entrypoint sh seaweedfs -c 'rm -rf /data/* && tar xzf - -C /' < "$dir/s3data.tar.gz"
else
  echo "Không có s3data.tar.gz: giữ nguyên kho tệp hiện tại." >&2
fi
docker compose up -d
echo "Đã khôi phục từ $dir. Chờ hệ thống sẵn sàng: node tests/wait-ready.js"
