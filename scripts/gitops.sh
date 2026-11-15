#!/bin/sh
# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# GitOps nhẹ: cấu hình hạ tầng là mã trong kho; kho là nguồn sự thật, máy chạy phải khớp kho.
#   sh scripts/gitops.sh check        kiểm cấu hình trong kho hợp lệ (compose, metadata Hasura, tuyến cổng API), không đổi gì
#   sh scripts/gitops.sh apply        lấy bản mới của nhánh hiện tại (chỉ tiến, không ghi đè), kiểm, rồi đưa hệ thống đang chạy về đúng cấu hình
#   sh scripts/gitops.sh watch [giây] lặp lại apply theo chu kỳ (mặc định 300 giây); chạy bằng `nohup` hoặc dịch vụ hệ thống
# shortcut: không phải bộ điều khiển như ArgoCD/Flux (không có điều phối nhiều máy, không tự hoàn tác); đủ cho một máy Docker Compose.
set -eu
cd "$(dirname "$0")/.."

check() {
  docker compose -f docker-compose.yml config -q
  docker compose -f docker-compose.yml -f docker-compose.optional.yml config -q
  node -e "JSON.parse(require('fs').readFileSync('infra/hasura/metadata.json','utf8'))"
  grep -q 'routes:' infra/apisix/apisix.yaml && grep -q '#END' infra/apisix/apisix.yaml
  echo "Cấu hình trong kho hợp lệ."
}

apply() {
  git fetch -q origin
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$branch")" ]; then
    git merge --ff-only "origin/$branch"
    echo "Đã lấy bản mới: $(git rev-parse --short HEAD)"
  fi
  check
  docker compose up -d --build
  docker compose up -d --force-recreate hasura-init  # nạp lại metadata Hasura theo kho
  echo "Hệ thống khớp với kho ở $(git rev-parse --short HEAD)."
}

case "${1:-}" in
  check) check ;;
  apply) apply ;;
  watch) while :; do apply || echo "apply lỗi, thử lại sau" >&2; sleep "${2:-300}"; done ;;
  *) echo "Dùng: sh scripts/gitops.sh check|apply|watch [giây]" >&2; exit 2 ;;
esac
