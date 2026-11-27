#!/bin/sh
# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# GitOps nhẹ: cấu hình hạ tầng là mã trong kho; kho là nguồn sự thật, máy chạy phải khớp kho.
#   sh scripts/gitops.sh check        kiểm cấu hình trong kho hợp lệ (compose, metadata Hasura, tuyến cổng API), không đổi gì
#   sh scripts/gitops.sh apply        lấy bản mới của nhánh hiện tại (chỉ tiến, không ghi đè), kiểm, rồi đưa hệ thống đang chạy về đúng cấu hình
#                                     (dựng lại dịch vụ, áp migration CSDL bằng scripts/migrate.sh, nạp lại metadata Hasura)
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

# Dịch vụ gắn (bind mount) tệp hay thư mục của kho mà có tệp đổi: phải tạo lại container. Gắn một tệp thì container giữ tệp cũ
# (git thay tệp bằng tệp mới, khác inode); gắn thư mục mã (workflow-bridge) thì tiến trình vẫn chạy mã đã nạp. Không có danh sách tệp
# đổi (lần apply đầu) thì coi mọi tệp của kho là đổi. PostgreSQL không cần tạo lại (thư mục init chỉ dùng khi volume trống,
# migration đã áp bằng migrate.sh); hasura-init luôn được chạy lại ở cuối.
mounted() {
  docker compose config --format json | node -e '
    const path = require("path")
    const cfg = JSON.parse(require("fs").readFileSync(0, "utf8"))
    const changed = process.argv.slice(1).map((f) => path.resolve(f))
    const hit = (src) => !changed.length ? src.startsWith(process.cwd() + path.sep) : changed.some((f) => f === src || f.startsWith(src + path.sep))
    console.log(Object.entries(cfg.services).filter(([, s]) => (s.volumes ?? []).some((v) => v.type === "bind" && hit(v.source))).map(([n]) => n).join(" "))
  ' "$@"
}

apply() {
  state=.git/gitops-applied  # commit đã áp lần trước (nằm trong .git, không thuộc kho)
  git fetch -q origin
  branch="$(git rev-parse --abbrev-ref HEAD)"
  if [ "$(git rev-parse HEAD)" != "$(git rev-parse "origin/$branch")" ]; then
    git merge --ff-only "origin/$branch"
    echo "Đã lấy bản mới: $(git rev-parse --short HEAD)"
  fi
  check
  head="$(git rev-parse HEAD)"
  last="$(cat "$state" 2>/dev/null || true)"
  [ "$last" = "$head" ] && { echo "Hệ thống đã khớp với kho ở $(git rev-parse --short HEAD)."; docker compose up -d; return; }
  docker compose up -d --build
  sh scripts/migrate.sh  # PostgreSQL không tự chạy lại thư mục init trên volume cũ: áp các migration chạy lại được
  if [ -n "$last" ] && git cat-file -e "$last^{commit}" 2>/dev/null; then
    svcs="$(mounted $(git diff --name-only "$last" "$head"))"
  else
    svcs="$(mounted)"
  fi
  svcs="$(echo "$svcs" | tr ' ' '\n' | grep -vxE 'hasura-init|postgres' | tr '\n' ' ')"
  if [ -n "${svcs% }" ]; then
    echo "Tạo lại dịch vụ có tệp cấu hình hay mã đổi: $svcs"
    docker compose up -d --force-recreate --no-deps $svcs
  fi
  docker compose up -d --force-recreate hasura-init  # nạp lại metadata Hasura theo kho (sau migration)
  echo "$head" > "$state"
  echo "Hệ thống khớp với kho ở $(git rev-parse --short HEAD)."
}

case "${1:-}" in
  check) check ;;
  apply) apply ;;
  watch) while :; do apply || echo "apply lỗi, thử lại sau" >&2; sleep "${2:-300}"; done ;;
  *) echo "Dùng: sh scripts/gitops.sh check|apply|watch [giây]" >&2; exit 2 ;;
esac
