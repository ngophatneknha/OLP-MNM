#!/bin/sh
# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# Đo RAM và CPU từng dịch vụ đang chạy (docker stats) để biết máy cần cấu hình tối thiểu bao nhiêu.
# Dùng: sh scripts/measure.sh
set -eu
cd "$(dirname "$0")/.."
docker stats --no-stream --format '{{.Name}}|{{.MemUsage}}|{{.CPUPerc}}' $(docker compose ps -q) |
  sed 's#^[^-]*-##; s#-[0-9]*|#|#' | sort | awk -F'|' '{ printf "%-18s %-24s %s\n", $1, $2, $3 }'
