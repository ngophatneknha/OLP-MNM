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
docker compose up -d --build

KC=http://localhost:8081/realms/dxlab/protocol/openid-connect/token
GW=http://localhost:9080/v1/graphql
APP="smoke_$(date +%s)"

token() {
  curl -fsS -d grant_type=password -d client_id=dxlab-cli -d "username=$1" -d password=dxlab-dev "$KC" |
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

[ "$(curl -s -o /dev/null -w '%{http_code}' -d grant_type=password -d client_id=dxlab-app -d username=staff1 -d password=dxlab-dev "$KC")" != 200 ] ||
  fail "ứng dụng web được phép đăng nhập bằng mật khẩu trực tiếp (chỉ nên dùng luồng chuyển hướng PKCE)"
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

echo "Không ai tự duyệt hồ sơ của chính mình"
ID=$(gql "$M1" manager "mutation{insert_submission_one(object:{app_key:\\\"$APP\\\",data:{so_tien:3000000}}){id}}" | sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
until_ok "hồ sơ của quản lý không vào bước duyệt" has "$M1" manager "{submission_by_pk(id:\\\"$ID\\\"){waiting_role}}" '"waiting_role":"manager"'
act "$M1" manager "$ID" truong_phong approve | grep -q '"id"' && fail "quản lý tự duyệt được hồ sơ của mình"

echo "Quy trình là mã nguồn: đề xuất thay đổi -> kiểm tra tự động -> người khác duyệt -> phiên bản mới"
SPEC2=$(printf '%s' "$SPEC" | sed 's/value:5000000/value:10000000/')
CID=$(gql "$M1" manager "mutation{insert_app_change_one(object:{app_key:\\\"$APP\\\",name:\\\"Tạm ứng\\\",spec:$SPEC2,note:\\\"Nâng ngưỡng giám đốc lên 10 triệu\\\"}){id}}" |
  sed -n 's/.*"id":\([0-9]*\).*/\1/p')
[ -n "$CID" ] || fail "quản lý không mở được đề xuất thay đổi"
has "$S1" staff "mutation{insert_app_change_one(object:{app_key:\\\"$APP\\\",name:\\\"x\\\",spec:$SPEC2,note:\\\"thử nghiệm\\\"}){id}}" '"id"' &&
  fail "nhân viên mở được đề xuất thay đổi"
MERGE="mutation{update_app_change_by_pk(pk_columns:{id:$CID},_set:{status:\\\"merged\\\"}){id}}"
# Chạy thử trên 4 hồ sơ đã có: chỉ hồ sơ 8 triệu đổi đường đi (không còn qua giám đốc).
until_ok "đề xuất không được kiểm tra tự động" has "$S1" staff "{app_change_by_pk(id:$CID){checks}}" '"changed": *1'
has "$M1" manager "$MERGE" '"id"' && fail "người đề xuất tự chấp nhận được đề xuất của mình"
has "$D1" director "$MERGE" '"id"' || fail "giám đốc không chấp nhận được đề xuất"
has "$D1" director "$MERGE" '"id"' && fail "chấp nhận được hai lần một đề xuất"
until_ok "phiên bản 2 không được phát hành" has "$S1" staff "{app_by_pk(key:\\\"$APP\\\"){status versions(order_by:{version:desc},limit:1){version note}}}" 'published.*"version":2'
ID=$(submit 8000000); waits "$ID" '"waiting_role":"manager"'
act "$M1" manager "$ID" truong_phong approve | grep -q '"id"' || fail "trưởng phòng không duyệt được"
waits "$ID" '"current_step":"chi_tien"'
has "$S1" staff '{library{key}}' '"key":"tam_ung"' || fail "không đọc được kho quy trình mẫu"

echo "Tệp đính kèm: chỉ người liên quan mới tải lên và tải về được"
AID=$(submit 4000000); waits "$AID" '"waiting_role":"manager"'
FILE=$(mktemp); printf 'noi dung thu nghiem %s' "$APP" > "$FILE"
FILES=http://localhost:9080/files
put() { curl -s -o "$TMP_OUT" -w '%{http_code}' -X POST -H "Authorization: Bearer $1" -H "x-hasura-role: $2" -H "x-submission-id: $AID" -H 'x-file-name: bao%20gia.txt' -H 'content-type: text/plain' --data-binary @"$FILE" "$FILES"; }
TMP_OUT=$(mktemp)
[ "$(put "$S2" staff)" = 403 ] || fail "người không liên quan tải tệp lên được hồ sơ của người khác"
[ "$(put "$S1" staff)" = 200 ] || fail "người gửi không đính kèm được tệp"
FID=$(sed -n 's/.*"id":"\([^"]*\)".*/\1/p' "$TMP_OUT"); [ -n "$FID" ] || fail "không nhận được mã tệp"
get() { curl -s -o "$TMP_OUT" -w '%{http_code}' -H "Authorization: Bearer $1" -H "x-hasura-role: $2" "$FILES/$FID"; }
[ "$(get "$S1" staff)" = 200 ] && grep -q "noi dung thu nghiem $APP" "$TMP_OUT" || fail "người gửi không tải lại đúng nội dung tệp"
[ "$(get "$M1" manager)" = 200 ] || fail "trưởng phòng không tải được tệp của hồ sơ chờ mình"
[ "$(get "$S2" staff)" = 404 ] || fail "người không liên quan tải được tệp"
[ "$(curl -s -o /dev/null -w '%{http_code}' "$FILES/$FID")" = 401 ] || fail "tải tệp không cần đăng nhập"
[ "$(curl -s -o /dev/null -w '%{http_code}' http://localhost:8333/dxlab/)" != 200 ] || fail "kho S3 mở ra ngoài cổng API"
rm -f "$FILE" "$TMP_OUT"

curl -fsS http://localhost:3000/config.json | grep -q '"apiUrl":"http' || fail "ứng dụng web không phục vụ cấu hình"
curl -fsS http://localhost:3000/apps | grep -q '<div id="app">' || fail "ứng dụng web không phục vụ trang"

docker compose exec -T postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -tAc "SELECT count(*) FROM bi.app_'"$APP"' WHERE so_tien >= 1000000"' |
  grep -q '^6' || fail "view phẳng cho BI không có đủ 6 hồ sơ"

echo "OK: sinh ứng dụng từ bản mô tả, 3 nhánh quy trình, phân quyền và view BI đều đúng."
