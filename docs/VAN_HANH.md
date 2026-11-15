<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Vận hành: sao lưu, TLS, giám sát, MFA

## Sao lưu và khôi phục

Sao lưu ba cơ sở dữ liệu (`dxlab`, `keycloak`, `flowable`) và kho tệp SeaweedFS, kèm tệp mã băm `SHA256SUMS`. Chạy khi hệ thống đang hoạt động:

```bash
sh scripts/backup.sh                 # vào backups/<ngày-giờ>
sh scripts/backup.sh /duong/dan/khac
```

Khôi phục **ghi đè** dữ liệu hiện tại: kiểm mã băm, dừng các dịch vụ dùng dữ liệu, dựng lại ba cơ sở dữ liệu, trả kho tệp về, rồi bật lại toàn bộ.

```bash
sh scripts/restore.sh backups/20261115-101500
node tests/wait-ready.js
```

Nên sao lưu theo lịch (ví dụ `cron` mỗi đêm) và chép thư mục `backups/` sang máy khác. Giới hạn: kho tệp được nén khi đang chạy, cần ảnh chụp nhất quán tuyệt đối thì dừng `seaweedfs` trước. Bộ kiểm thử `tests/restore.test.js` chạy trọn vòng sao lưu, phá dữ liệu, khôi phục trên hệ thống thật:

```bash
RESTORE_TEST=1 node --test tests/restore.test.js   # phá và khôi phục dữ liệu thật, không chạy cùng bộ khác
```

## TLS tại biên (Caddy)

Thành phần tùy chọn nằm trong `docker-compose.optional.yml`, tách khỏi bản lõi để máy yếu vẫn chạy được:

```bash
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile tls up -d
```

Caddy mở ba địa chỉ HTTPS với chứng chỉ nội bộ (trình duyệt cảnh báo cho tới khi tin CA của Caddy): web `https://localhost:8443`, API `https://localhost:9443`, đăng nhập `https://localhost:8444`. Để dùng ứng dụng qua HTTPS, đặt trong `.env` rồi dựng lại:

```
KEYCLOAK_PUBLIC_URL=https://localhost:8444
API_PUBLIC_URL=https://localhost:9443
APP_ORIGIN=https://localhost:8443
```

Triển khai thật: đổi `localhost` trong `infra/caddy/Caddyfile` thành tên miền, Caddy sẽ tự lấy chứng chỉ Let's Encrypt.

## Tường lửa ứng dụng (Coraza)

```bash
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile waf up -d --build
```

Coraza (WAF mã nguồn mở, Apache-2.0) chạy trong Caddy cùng bộ luật OWASP CRS, đứng trước cổng API tại `http://localhost:9081` (đổi bằng `WAF_PORT`). Dùng 9081 thay cho 9080 là mọi yêu cầu được kiểm tra trước: SQL injection, XSS, đi ngược thư mục bị trả `403`. Lần dựng đầu mất vài phút vì biên dịch Caddy kèm Coraza. Nếu một chức năng bị chặn nhầm, đọc nhật ký bằng `docker compose logs waf` rồi thêm luật loại trừ trong `infra/coraza/Caddyfile`.

## Két bí mật (OpenBao)

```bash
sh scripts/vault.sh init     # khởi tạo két, chép mật khẩu/khóa/token trong .env vào két
sh scripts/vault.sh up       # chạy hệ thống với bí mật lấy từ két
```

Sau `init`, khóa mở và token gốc nằm ở `.vault-keys` (không commit). **Hãy cất tệp này ra ngoài máy chủ rồi xóa**, sau đó xóa các dòng bí mật trong `.env`. Két khởi động lại sẽ bị khóa: `sh scripts/vault.sh unseal` (cần tệp khóa). Giới hạn: một khóa mở duy nhất, chưa tự mở khóa; môi trường thật nên chia khóa cho nhiều người.

## Cảm biến (IT/OT)

1. Xuất bản ứng dụng sửa chữa: nhập mẫu `library/iot/sua_chua.json` bằng Soạn quy trình (cần các trường `thiet_bi`, `cam_bien`, `gia_tri`, `mo_ta`).
2. Giám đốc đăng ký cảm biến, ví dụ bằng `curl` với token đăng nhập:

```bash
curl -X POST "$API/sensors" -H "authorization: Bearer $TOKEN" -H "x-hasura-role: director" -H "content-type: application/json"   -d '{"key":"lanh_kho1","name":"Tủ lạnh kho 1","unit":"°C","threshold":8,"direction":"above","repair_app":"sua_chua"}'
```

Phản hồi có `token` (chỉ hiện một lần): cất vào thiết bị. 3. Thiết bị gửi số đo:

```bash
curl -X POST "$API/telemetry/lanh_kho1" -H "x-sensor-token: $DEVICE_TOKEN" -H "content-type: application/json" -d '{"value": 11.5}'
```

Có thể gửi mảng tới 100 số đo kèm `at` (ISO 8601, trong 7 ngày qua). Vượt ngưỡng thì hồ sơ sửa chữa tự mở và hiện ở trưởng phòng. Token đi qua HTTP thường nên môi trường thật cần bật TLS. Máy đang chạy cần áp `infra/postgres/init/04-iot.sql` bằng psql (hoặc dựng lại CSDL).

## Giám sát (Prometheus)

```bash
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile monitoring up -d
```

Prometheus thu số đo của cổng API (APISIX) mỗi 15 giây, giao diện truy vấn ở `http://localhost:9092` (đổi cổng bằng `PROMETHEUS_PORT`). Ví dụ truy vấn: `sum by (code) (rate(apisix_http_status[1m]))`. Chưa dùng Grafana vì giấy phép AGPL-3.0, trái chính sách của dự án.

## Xác thực nhiều yếu tố (MFA)

Tài khoản có vai trò **Trưởng phòng** hoặc **Giám đốc** phải nhập mã OTP (TOTP, ứng dụng như FreeOTP hay Google Authenticator) sau mật khẩu khi đăng nhập qua trình duyệt; lần đầu họ được hướng dẫn quét mã QR để thiết lập. Nhân viên và kế toán chỉ cần mật khẩu. Luồng khai báo trong `infra/keycloak/realm/dxlab-realm.json` (luồng `browser-mfa`), kiểm thử bằng ca T1-SSO-10.

Lưu ý: client dòng lệnh `dxlab-cli` dùng cấp quyền bằng mật khẩu chỉ để kiểm thử, không đi qua luồng trình duyệt nên không bị MFA chặn; không dùng nó ngoài môi trường phát triển.

## Nhiều tổ chức

Mỗi người dùng thuộc đúng một tổ chức, ghi bằng thuộc tính `org_id` của tài khoản Keycloak (đi vào token thành claim `org_id`; thiếu thì là `default`). Hasura thêm điều kiện `org_id` vào mọi quyền đọc và ghi, nên cách ly nằm ở CSDL chứ không ở giao diện.

Lập tổ chức mới (chưa có màn hình quản trị):

```bash
docker compose exec -T postgres psql -U dxlab -d dxlab -c "INSERT INTO org (id, name) VALUES ('congtyc', 'Công ty C')"
```

Rồi trong Keycloak (realm `dxlab`) tạo người dùng và đặt thuộc tính `org_id = congtyc`. Giám đốc của tổ chức đó tự có kho lạnh và cảm biến riêng.

Nâng cấp hệ thống đang chạy (volume cũ): áp tệp SQL, khởi động lại Hasura để nhận cấu hình token mới, và thêm vào Keycloak thuộc tính người dùng `org_id` cùng một "mapper" thuộc tính vào token cho hai client `dxlab-app` và `dxlab-cli` (hoặc nhập lại realm trên Keycloak trống: `dxlab-realm.json` đã khai báo sẵn). Không có claim thì mọi người vẫn ở tổ chức mặc định nên hệ thống cũ chạy như trước. Phần SQL đã được thử trên CSDL có dữ liệu từ trước 1.8.4: dòng cũ nhận `org_id = 'default'`, hồ sơ mới vẫn nhận tổ chức từ quy trình, chạy lại tệp lần hai không lỗi; phần Keycloak thì chưa thử trên realm đã có.

```bash
docker compose exec -T postgres psql -U dxlab -d dxlab < infra/postgres/init/05-org.sql
docker compose up -d hasura hasura-init workflow-bridge
```
