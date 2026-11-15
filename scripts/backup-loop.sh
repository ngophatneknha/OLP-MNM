#!/bin/sh
# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# Sao lưu tự động theo lịch (chạy trong dịch vụ `backup` của docker-compose.optional.yml, profile backup).
# Mỗi BACKUP_INTERVAL_HOURS giờ chép ba cơ sở dữ liệu PostgreSQL vào /backups/<ngày-giờ> kèm SHA256SUMS,
# giữ BACKUP_KEEP bản mới nhất. Biến BACKUP_ONCE=1: chỉ chạy một lần rồi thoát (dùng khi kiểm thử).
# shortcut: chỉ sao lưu CSDL; kho tệp S3 vẫn dùng scripts/backup.sh (cần docker). Khôi phục: scripts/restore.sh.
set -eu
: "${BACKUP_INTERVAL_HOURS:=24}" "${BACKUP_KEEP:=7}"
export PGPASSWORD="$POSTGRES_PASSWORD"
while :; do
  dir="/backups/$(date +%Y%m%d-%H%M%S)"
  mkdir -p "$dir"
  for db in dxlab keycloak flowable; do
    pg_dump -h postgres -U "$POSTGRES_USER" --no-owner "$db" | gzip > "$dir/$db.sql.gz"
  done
  ( cd "$dir" && sha256sum ./*.gz > SHA256SUMS )
  echo "Đã sao lưu vào $dir"
  # Xóa các bản cũ, chỉ giữ BACKUP_KEEP bản mới nhất (tên thư mục theo thời gian nên sắp tên là sắp theo giờ).
  ls -1d /backups/*/ | sort -r | tail -n +"$((BACKUP_KEEP + 1))" | xargs -r rm -rf
  [ "${BACKUP_ONCE:-}" = 1 ] && exit 0
  sleep "$((BACKUP_INTERVAL_HOURS * 3600))"
done
