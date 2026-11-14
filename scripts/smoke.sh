#!/bin/sh
# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# Smoke test: dựng hệ thống, đăng nhập Keycloak, rồi qua gateway:
# quản lý định nghĩa một ứng dụng quy trình 3 bước -> hệ thống tự sinh quy trình ->
# chạy các nhánh (duyệt 2 cấp, bỏ qua cấp giám đốc, từ chối) và kiểm tra phân quyền.
# Chạy trên volume trống (docker compose down -v) hoặc chạy lại nhiều lần đều được.
set -eu
cd "$(dirname "$0")/.."
[ -f .env ] || cp .env.example .env
docker compose up -d

KC=http://localhost:8081/realms/dxlab/protocol/openid-connect/token
GW=http://localhost:9080/v1/graphql
APP="smoke_$(date +%s)"

token() {
  curl -fsS -d grant_type=password -d client_id=dxlab-app -d "username=$1" -d password=dxlab-dev "$KC" |
    sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'
}
# gql <token> <role> <query>  (dấu nháy kép trong query viết là \")
gql() {
  # Gửi thân yêu cầu qua stdin: curl trên Windows làm hỏng ký tự UTF-8 trong tham số dòng lệnh.
  printf '{"query":"%s"}' "$3" |
    curl -sS -H "Authorization: Bearer $1" -H "x-hasura-role: $2" -H 'Content-Type: application/json' -d @- "$GW"
}
fail() { echo "FAIL: $1" >&2; exit 1; }
# until_ok <mô tả> <lệnh...>: thử lại lệnh tối đa 2 phút
until_ok() {
  what=$1; shift; i=0
  until "$@" >/dev/null 2>&1; do
    i=$((i + 1)); [ "$i" -le 60 ] || fail "$what"
    sleep 2
  done
}
# has <token> <role> <query> <chuỗi mong đợi trong kết quả>
has() { gql "$1" "$2" "$3" | grep -q "$4"; }
# submit <số tiền (JSON)> -> in ra id hồ sơ (rỗng nếu bị từ chối)
submit() {
  gql "$S1" staff "mutation{insert_submission_one(object:{app_key:\\\"$APP\\\",data:{so_tien:$1}}){id}}" |
    sed -n 's/.*"id":"\([^"]*\)".*/\1/p'
}
# act <token> <role> <id hồ sơ> <bước> <hành động>
act() {
  gql "$1" "$2" "mutation{insert_submission_event_one(object:{submission_id:\\\"$3\\\",step_key:\\\"$4\\\",action:\\\"$5\\\"}){id}}"
}
# waits <id hồ sơ> <chuỗi mong đợi>: chờ trạng thái hồ sơ (người gửi nhìn thấy)
waits() {
  until_ok "hồ sơ $1 không đạt trạng thái $2" has "$S1" staff "{submission_by_pk(id:\\\"$1\\\"){status current_step waiting_role}}" "$2"
}

echo "Chờ hệ thống sẵn sàng..."
i=0
until M1=$(token manager1 2>/dev/null) && [ -n "$M1" ] && has "$M1" manager '{app{key}}' '"data"'; do
  i=$((i + 1)); [ "$i" -le 60 ] || fail "hệ thống không sẵn sàng sau 5 phút"
  sleep 5
done
S1=$(token staff1); S2=$(token staff2); D1=$(token director1); A1=$(token accountant1)

[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d '{"query":"{app{key}}"}' "$GW")" = 401 ] ||
  fail "gateway không trả 401 khi thiếu token"

echo "Quản lý định nghĩa ứng dụng $APP..."
SPEC='{fields:[{key:\"so_tien\",label:\"Số tiền\",type:\"number\",required:true}],steps:[{key:\"truong_phong\",name:\"Trưởng phòng duyệt\",role:\"manager\"},{key:\"giam_doc\",name:\"Giám đốc duyệt\",role:\"director\",when:{field:\"so_tien\",op:\">\",value:5000000}},{key:\"chi_tien\",name:\"Kế toán chi tiền\",role:\"accountant\",type:\"task\"}]}'
has "$S1" staff "mutation{insert_app_one(object:{key:\\\"x$APP\\\",name:\\\"x\\\",spec:$SPEC}){key}}" "x$APP" &&
  fail "nhân viên tạo được ứng dụng"
has "$M1" manager "mutation{insert_app_one(object:{key:\\\"$APP\\\",name:\\\"Tạm ứng\\\",spec:$SPEC}){key}}" "$APP" ||
  fail "quản lý không tạo được ứng dụng"
# Flowable khởi động chậm; Hasura tự gửi lại sự kiện cho tới khi xuất bản xong.
until_ok "ứng dụng không được xuất bản" has "$S1" staff "{app(where:{key:{_eq:\\\"$APP\\\"}}){status}}" published

echo "Nhánh 1: 8 triệu -> trưởng phòng -> giám đốc -> kế toán"
[ -z "$(submit '\"abc\"')" ] || fail "hồ sơ sai kiểu dữ liệu vẫn được nhận"
ID=$(submit 8000000); [ -n "$ID" ] || fail "nhân viên không gửi được hồ sơ"
waits "$ID" '"waiting_role":"manager"'
has "$S2" staff "{submission_by_pk(id:\\\"$ID\\\"){id}}" "$ID" && fail "staff2 đọc được hồ sơ của staff1"
act "$S1" staff "$ID" truong_phong approve | grep -q '"id"' && fail "người gửi tự duyệt được hồ sơ"
act "$D1" director "$ID" truong_phong approve | grep -q '"id"' && fail "giám đốc duyệt thay bước của trưởng phòng"
act "$M1" manager "$ID" truong_phong approve | grep -q '"id"' || fail "trưởng phòng không duyệt được"
waits "$ID" '"current_step":"giam_doc"'
act "$D1" director "$ID" giam_doc approve | grep -q '"id"' || fail "giám đốc không duyệt được"
waits "$ID" '"waiting_role":"accountant"'
act "$A1" accountant "$ID" chi_tien done | grep -q '"id"' || fail "kế toán không hoàn tất được"
waits "$ID" '"status":"approved"'

echo "Nhánh 2: 1 triệu -> bỏ qua giám đốc"
ID=$(submit 1000000); waits "$ID" '"waiting_role":"manager"'
act "$M1" manager "$ID" truong_phong approve | grep -q '"id"' || fail "trưởng phòng không duyệt được"
waits "$ID" '"current_step":"chi_tien"'

echo "Nhánh 3: từ chối"
ID=$(submit 2000000); waits "$ID" '"waiting_role":"manager"'
act "$M1" manager "$ID" truong_phong reject | grep -q '"id"' || fail "trưởng phòng không từ chối được"
waits "$ID" '"status":"rejected"'
act "$M1" manager "$ID" truong_phong approve | grep -q '"id"' && fail "vẫn hành động được trên hồ sơ đã kết thúc"

docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM bi.app_'"$APP"' WHERE so_tien >= 1000000"' |
  grep -q '^3' || fail "view phẳng cho BI không có đủ 3 hồ sơ"

echo "OK: sinh ứng dụng từ bản mô tả, 3 nhánh quy trình, phân quyền và view BI đều đúng."
