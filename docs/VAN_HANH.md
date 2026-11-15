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

## Giám sát (Prometheus)

```bash
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile monitoring up -d
```

Prometheus thu số đo của cổng API (APISIX) mỗi 15 giây, giao diện truy vấn ở `http://localhost:9092` (đổi cổng bằng `PROMETHEUS_PORT`). Ví dụ truy vấn: `sum by (code) (rate(apisix_http_status[1m]))`. Chưa dùng Grafana vì giấy phép AGPL-3.0, trái chính sách của dự án.

## Xác thực nhiều yếu tố (MFA)

Tài khoản có vai trò **Trưởng phòng** hoặc **Giám đốc** phải nhập mã OTP (TOTP, ứng dụng như FreeOTP hay Google Authenticator) sau mật khẩu khi đăng nhập qua trình duyệt; lần đầu họ được hướng dẫn quét mã QR để thiết lập. Nhân viên và kế toán chỉ cần mật khẩu. Luồng khai báo trong `infra/keycloak/realm/dxlab-realm.json` (luồng `browser-mfa`), kiểm thử bằng ca T1-SSO-10.

Lưu ý: client dòng lệnh `dxlab-cli` dùng cấp quyền bằng mật khẩu chỉ để kiểm thử, không đi qua luồng trình duyệt nên không bị MFA chặn; không dùng nó ngoài môi trường phát triển.
