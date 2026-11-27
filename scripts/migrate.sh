#!/bin/sh
# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# Nâng cấp lược đồ CSDL đang chạy: áp lại các tệp infra/postgres/init/05-*.sql trở đi (đa tổ chức, chữ ký số, vị trí, NGSI-LD,
# trục sự kiện...). PostgreSQL chỉ tự chạy thư mục init khi volume còn trống, nên máy đã chạy từ bản cũ phải áp bằng lệnh này.
# Các tệp từ 05 trở đi viết để chạy lại được (IF NOT EXISTS, ON CONFLICT), ca UPG-01 kiểm điều đó trên CSDL có dữ liệu cũ; 02..04 tạo
# lược đồ gốc nên không áp lại. Mỗi tệp dừng ngay ở lỗi đầu tiên (ON_ERROR_STOP). scripts/gitops.sh apply gọi lệnh này.
#   sh scripts/migrate.sh
# MIGRATE_DIR đổi thư mục chứa tệp SQL (chỉ dùng cho kiểm thử).
set -eu
cd "$(dirname "$0")/.."
dir="${MIGRATE_DIR:-infra/postgres/init}"
docker compose up -d --wait postgres >/dev/null 2>&1 || { echo "PostgreSQL chưa sẵn sàng" >&2; exit 1; }
psql() { docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1 -q -At "$@"' sh "$@"; }
if [ "$(psql -c "SELECT to_regclass('public.submission_event') IS NOT NULL" </dev/null)" != t ]; then
  echo "CSDL chưa có lược đồ gốc (đang khởi tạo lần đầu?): bỏ qua, PostgreSQL tự chạy thư mục init." >&2
  exit 0
fi
for f in "$dir"/*.sql; do
  case "$(basename "$f")" in 0[0-4]*) continue ;; esac
  if ! out=$(psql <"$f" 2>&1); then
    printf '%s\n' "$out" >&2
    echo "Lỗi khi áp $(basename "$f"); các tệp sau chưa được áp." >&2
    exit 1
  fi
  echo "Đã áp $(basename "$f")"
done
