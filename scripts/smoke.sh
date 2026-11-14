#!/bin/sh
# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# Smoke test: dựng hệ thống từ đầu, đăng nhập Keycloak, gọi GraphQL qua gateway,
# kiểm tra phân quyền theo dòng và quy trình phê duyệt trên Flowable.
# Cần volume trống (docker compose down -v).
set -eu
cd "$(dirname "$0")/.."
[ -f .env ] || cp .env.example .env
. ./.env
docker compose up -d

KC=http://localhost:8081/realms/dxlab/protocol/openid-connect/token
GW=http://localhost:9080/v1/graphql
FL=http://localhost:8083/flowable-rest/service

token() {
  curl -fsS -d grant_type=password -d client_id=dxlab-app -d "username=$1" -d password=dxlab-dev "$KC" |
    sed -n 's/.*"access_token":"\([^"]*\)".*/\1/p'
}
# gql <token> <role> <query>  (dấu nháy kép trong query viết là \")
gql() {
  curl -fsS -H "Authorization: Bearer $1" -H "x-hasura-role: $2" -H 'Content-Type: application/json' \
    -d "{\"query\":\"$3\"}" "$GW"
}
fail() { echo "FAIL: $1" >&2; exit 1; }

echo "Chờ hệ thống sẵn sàng..."
i=0
until S1=$(token staff1 2>/dev/null) && [ -n "$S1" ] &&
  gql "$S1" staff '{request{id}}' 2>/dev/null | grep -q '"data"' &&
  curl -fsS -u "$FLOWABLE_USER:$FLOWABLE_PASSWORD" "$FL/repository/process-definitions?key=requestApproval" 2>/dev/null |
  grep -q '"key":"requestApproval"'; do
  i=$((i + 1))
  [ "$i" -le 60 ] || fail "hệ thống không sẵn sàng sau 5 phút"
  sleep 5
done
S2=$(token staff2)
M1=$(token manager1)

ID=$(gql "$S1" staff 'mutation{insert_request_one(object:{title:\"smoke-test\"}){id}}' |
  sed -n 's/.*"id":"\([^"]*\)".*/\1/p')
[ -n "$ID" ] || fail "staff1 không tạo được yêu cầu"
APPROVE="mutation{update_request_by_pk(pk_columns:{id:\\\"$ID\\\"},_set:{status:\\\"approved\\\"}){id}}"

gql "$S1" staff '{request{title}}' | grep -q smoke-test || fail "staff1 không thấy yêu cầu của mình"
gql "$S2" staff '{request{title}}' | grep -q smoke-test && fail "staff2 đọc được yêu cầu của staff1"
gql "$M1" manager '{request{title}}' | grep -q smoke-test || fail "manager không thấy yêu cầu"
gql "$S1" manager '{request{title}}' | grep -q '"data"' && fail "staff1 dùng được role manager"
gql "$S1" staff "$APPROVE" | grep -q "$ID" && fail "staff1 tự duyệt được yêu cầu"
[ "$(curl -s -o /dev/null -w '%{http_code}' -H 'Content-Type: application/json' -d '{"query":"{request{id}}"}' "$GW")" = 401 ] ||
  fail "gateway không trả 401 khi thiếu token"

# Quy trình: quản lý duyệt -> tiến trình Flowable của yêu cầu phải kết thúc ở nút "approved".
gql "$M1" manager "$APPROVE" | grep -q "$ID" || fail "manager không duyệt được yêu cầu"
i=0
until curl -fsS -u "$FLOWABLE_USER:$FLOWABLE_PASSWORD" "$FL/history/historic-process-instances?businessKey=$ID&finished=true" |
  grep -q '"endActivityId":"approved"'; do
  i=$((i + 1))
  [ "$i" -le 36 ] || fail "tiến trình Flowable không kết thúc ở nút approved"
  sleep 5
done

echo "OK: SSO -> gateway -> GraphQL, phân quyền theo dòng và quy trình phê duyệt đều đúng."
