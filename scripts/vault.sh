#!/bin/sh
# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# Két bí mật OpenBao (nhánh mã nguồn mở của Vault, MPL-2.0) cho các bí mật trong .env.
#   sh scripts/vault.sh init     khởi tạo két, mở khóa, chép mọi bí mật trong .env vào két (secret/dxlab)
#   sh scripts/vault.sh unseal   mở khóa lại sau khi két khởi động lại
#   sh scripts/vault.sh export   in các dòng "export KHÓA='giá trị'" lấy từ két
#   sh scripts/vault.sh up       lấy bí mật từ két rồi chạy docker compose up -d (không cần bí mật trong .env)
# Khóa mở và token gốc nằm ở .vault-keys (quyền 600, đã có trong .gitignore): hãy cất ra ngoài máy chủ rồi xóa tệp này.
# shortcut: một khóa mở duy nhất (không chia sẻ Shamir) và lưu trữ tệp; môi trường thật nên chia khóa cho nhiều người và dùng auto-unseal.
set -eu
cd "$(dirname "$0")/.."
KEYS="${VAULT_KEYS_FILE:-.vault-keys}"
compose() { docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile vault "$@"; }
bao() { compose exec -T -e BAO_ADDR=http://127.0.0.1:8200 ${BAO_TOKEN:+-e BAO_TOKEN="$BAO_TOKEN"} openbao bao "$@"; }
key_of() { sed -n "s/^$1=//p" "$KEYS"; }

case "${1:-}" in
  init)
    compose up -d openbao
    until bao status -format=json >/dev/null 2>&1 || [ "$?" = 2 ]; do sleep 1; done
    if bao status -format=json | grep -q '"initialized": *false'; then
      ( umask 077; bao operator init -key-shares=1 -key-threshold=1 -format=json |
        node -e 'const j=JSON.parse(require("fs").readFileSync(0,"utf8"));console.log("UNSEAL_KEY="+j.unseal_keys_b64[0]+"\nROOT_TOKEN="+j.root_token)' > "$KEYS" )
    fi
    sh "$0" unseal
    BAO_TOKEN="$(key_of ROOT_TOKEN)"; export BAO_TOKEN
    bao secrets enable -path=secret kv-v2 >/dev/null 2>&1 || true
    # Chỉ các biến mang bí mật (mật khẩu, khóa, token) mới vào két; địa chỉ và tên người dùng ở lại .env.
    node -e 'const o={};for(const l of require("fs").readFileSync(".env","utf8").split("\n")){const m=l.match(/^([A-Z0-9_]*(?:PASSWORD|SECRET|_KEY|TOKEN)[A-Z0-9_]*)=(.+)$/);if(m)o[m[1]]=m[2]}console.log(JSON.stringify(o))' |
      bao kv put secret/dxlab - >/dev/null
    echo "Đã chép bí mật vào két OpenBao (secret/dxlab). Khóa mở và token gốc ở $KEYS: cất ra ngoài rồi xóa tệp này."
    ;;
  unseal)
    bao operator unseal "$(key_of UNSEAL_KEY)" >/dev/null
    ;;
  export)
    BAO_TOKEN="$(key_of ROOT_TOKEN)"; export BAO_TOKEN
    bao kv get -format=json secret/dxlab |
      node -e 'const d=JSON.parse(require("fs").readFileSync(0,"utf8")).data.data;for(const[k,v]of Object.entries(d))console.log("export "+k+"=\x27"+String(v).replace(/\x27/g,"\x27\\x27\x27")+"\x27")'
    ;;
  up)
    eval "$(sh "$0" export)"
    docker compose up -d "$@"
    ;;
  *) echo "Dùng: sh scripts/vault.sh init|unseal|export|up" >&2; exit 1 ;;
esac
