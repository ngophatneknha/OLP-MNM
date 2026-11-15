#!/bin/sh
# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# Đưa hệ thống về trạng thái sạch cho buổi trình diễn hoặc diễn tập: xóa dữ liệu cũ, dựng lại, nạp dữ liệu mẫu.
# CẢNH BÁO: xóa toàn bộ dữ liệu (cơ sở dữ liệu, tệp đính kèm, tài khoản đã thiết lập OTP). Chỉ dùng cho máy demo.
#   sh scripts/demo-reset.sh          # hỏi lại trước khi xóa
#   sh scripts/demo-reset.sh --yes    # không hỏi
set -eu
cd "$(dirname "$0")/.."

if [ "${1:-}" != "--yes" ]; then
  printf 'Xóa TOÀN BỘ dữ liệu và dựng lại hệ thống? Gõ "xoa" để tiếp tục: '
  read -r answer
  [ "$answer" = "xoa" ] || { echo "Đã hủy."; exit 1; }
fi

docker compose down -v
docker compose up -d --build
node tests/wait-ready.js 600
docker compose exec -T workflow-bridge node seed.js
echo "Sẵn sàng. Đăng nhập staff1, manager1, director1, accountant1 (manager1 và director1 phải thiết lập OTP lần đầu)."
