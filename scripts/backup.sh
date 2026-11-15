#!/bin/sh
# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# Sao lưu toàn bộ dữ liệu: ba cơ sở dữ liệu PostgreSQL (dxlab, keycloak, flowable) và kho tệp SeaweedFS.
# Dùng: sh scripts/backup.sh [thư-mục-đích]   (mặc định backups/<ngày-giờ>)
# Chạy khi hệ thống đang hoạt động.
# shortcut: kho tệp được nén khi đang chạy (tệp .dat chỉ ghi thêm nên an toàn trong thực tế); cần ảnh chụp nhất quán thì dừng seaweedfs trước.
set -eu
cd "$(dirname "$0")/.."
[ -f .env ] && set -a && . ./.env && set +a
dir="${1:-backups/$(date +%Y%m%d-%H%M%S)}"
mkdir -p "$dir"
for db in dxlab keycloak flowable; do
  docker compose exec -T postgres pg_dump -U "$POSTGRES_USER" --no-owner "$db" | gzip > "$dir/$db.sql.gz"
done
docker compose exec -T seaweedfs sh -c 'cd / && tar czf - data' > "$dir/s3data.tar.gz"
( cd "$dir" && sha256sum ./*.gz > SHA256SUMS )
echo "Đã sao lưu vào $dir"
