<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Tài liệu kỹ thuật và sổ tay vận hành

Kiến trúc và luồng dữ liệu: [architecture.md](architecture.md). Sao lưu, TLS, giám sát, MFA: [VAN_HANH.md](VAN_HANH.md). Tìm kiếm, hỏi đáp, AI tại chỗ: [TRI_TUE.md](TRI_TUE.md). Tài liệu này là sổ tay hằng ngày: dịch vụ nào làm gì, khởi động, kiểm tra, xử lý sự cố.

## Các dịch vụ

| Dịch vụ | Vai trò | Cổng ra máy chủ | Phụ thuộc |
|---|---|---|---|
| `postgres` | Dữ liệu có cấu trúc: `dxlab` (ứng dụng), `keycloak`, `flowable` | không | |
| `keycloak` | Đăng nhập một lần (OIDC, PKCE), MFA cho trưởng phòng và giám đốc | 8081 | postgres |
| `hasura` | API GraphQL, phân quyền theo dòng, JWT bằng JWKS của Keycloak | không | postgres, keycloak |
| `hasura-init` | Chạy một lần: nạp bảng, quan hệ, phân quyền | không | hasura |
| `flowable` | Động cơ quy trình BPMN (chỉ REST) | không | postgres |
| `workflow-bridge` | Biên dịch quy trình, nối sự kiện Hasura với Flowable, tệp đính kèm, tìm kiếm và hỏi đáp, trợ lý AI | không | hasura, flowable, seaweedfs, clamav |
| `seaweedfs` | Kho đối tượng S3 cho tệp đính kèm | không | |
| `clamav` | Quét mã độc mọi tệp tải lên | không | |
| `apisix` | Cổng API duy nhất: kiểm JWT, CORS, giới hạn tần suất | 9080 | hasura, keycloak |
| `web` | Ứng dụng web Vue 3 do nginx phục vụ | 3000 | apisix |

Tùy chọn (`docker-compose.optional.yml`): `caddy` (profile `tls`), `prometheus` (profile `monitoring`, cổng 9092), `meilisearch` (profile `search`), `ollama` (profile `ai`).

## Khởi động, dừng, kiểm tra

```bash
cp .env.example .env
docker compose up -d --build
node tests/wait-ready.js            # chờ từng dịch vụ sẵn sàng, báo dịch vụ nào chưa
docker compose exec workflow-bridge node seed.js   # dữ liệu mẫu (tùy chọn)

docker compose ps                   # trạng thái
docker compose logs -f workflow-bridge keycloak    # nhật ký
docker compose down                 # dừng, giữ dữ liệu
docker compose down -v              # dừng và XÓA dữ liệu
```

Lần khởi động đầu mất 1-2 phút; ClamAV cần thêm vài phút để tải cơ sở dữ liệu nhận dạng (khoảng 1,5 GB RAM). Cần khoảng 4 GB RAM cho Docker.

## Cấu hình

Mọi cấu hình nằm trong `.env` (mẫu `.env.example`), không phải sửa mã. Gồm mật khẩu cơ sở dữ liệu, quản trị Keycloak, khóa nội bộ giữa Hasura và cầu nối, địa chỉ công khai (`KEYCLOAK_PUBLIC_URL`, `API_PUBLIC_URL`, `APP_ORIGIN`), khóa kho tệp S3 (`S3_ACCESS_KEY`, `S3_SECRET_KEY`) và trợ lý AI (`AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY`). **Đổi mọi giá trị `change-me` trước khi đưa lên Internet.** Khóa AI chỉ nằm trong `.env`, tệp này không được commit.

Sau khi sửa `.env`: `docker compose up -d` (dịch vụ nào đổi cấu hình sẽ được tạo lại). Sửa tệp trong `infra/apisix/` cần `docker compose restart apisix`.

## Dữ liệu nằm ở đâu

| Dữ liệu | Nơi lưu | Sao lưu bằng |
|---|---|---|
| Hồ sơ, quy trình, nhật ký, ý kiến AI | PostgreSQL, cơ sở `dxlab` | `scripts/backup.sh` |
| Tài khoản, phiên đăng nhập | PostgreSQL, cơ sở `keycloak` | `scripts/backup.sh` |
| Trạng thái động cơ quy trình | PostgreSQL, cơ sở `flowable` | `scripts/backup.sh` |
| Tệp đính kèm | volume `s3data` (SeaweedFS) | `scripts/backup.sh` |
| Chỉ mục tìm kiếm | volume `meilidata` | không cần: tự dựng lại từ dữ liệu |

Nhật ký ký duyệt (`submission_event`) **bất biến ở tầng cơ sở dữ liệu**: không UPDATE, DELETE hay TRUNCATE được, kể cả khi gọi thẳng vào cơ sở dữ liệu.

## Sự cố thường gặp

| Hiện tượng | Nguyên nhân thường gặp | Cách xử lý |
|---|---|---|
| `docker compose up` báo cổng đã bị dùng | 3000, 8081, 9080 (hoặc 9092, 8443...) đang bị chương trình khác giữ | Tắt chương trình đó; riêng Prometheus đổi `PROMETHEUS_PORT` trong `.env` |
| Mở web báo lỗi kết nối, hoặc vòng lặp đăng nhập | Keycloak chưa sẵn sàng; hoặc `KEYCLOAK_PUBLIC_URL` trong `.env` không khớp địa chỉ đang dùng | `node tests/wait-ready.js`; đối chiếu `.env` với địa chỉ trình duyệt |
| Tải tệp lên báo 503 "trạm kiểm dịch chưa sẵn sàng" | ClamAV còn đang tải cơ sở dữ liệu | Chờ vài phút, kiểm `docker compose logs clamav` |
| Tải tệp lên báo 422 | Tệp bị phát hiện mã độc | Đúng thiết kế; kiểm tra tệp |
| Quy trình mới kẹt ở trạng thái "đang chờ" | Cầu nối chưa biên dịch xong hoặc Flowable chưa sẵn sàng | Chờ vài giây (cầu nối tự quét mỗi 10 giây); xem `docker compose logs workflow-bridge` |
| Quy trình hiện trạng thái "lỗi" | Bản mô tả không hợp lệ (bị chặn đúng thiết kế) | Mở quy trình, đọc thông báo lỗi, sửa rồi xuất bản lại |
| Hỏi đáp báo "Tìm kiếm chưa được bật" | Chưa bật profile `search` | `docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile search up -d` |
| Hỏi đáp có nguồn nhưng không có câu trả lời | Chưa cấu hình AI, hoặc dịch vụ AI giới hạn tần suất | Điền `AI_*` trong `.env`; nguồn vẫn dùng được |
| Báo 429 | Vượt giới hạn tần suất của cổng API | Chờ một phút |
| Trưởng phòng/giám đốc mất OTP | Mất ứng dụng OTP | Quản trị Keycloak (cổng 8081, tài khoản quản trị trong `.env`): người dùng > Credentials > xóa OTP, lần sau thiết lập lại |
| Cần xóa sạch làm lại | | `docker compose down -v` rồi `docker compose up -d --build` |

## Kiểm thử

```bash
node tests/wait-ready.js
GITHUB_TOKEN=$(gh auth token) node --test --test-reporter=spec tests/*.test.js
node --test services/workflow-bridge/*.test.js web/src/*.test.js    # kiểm thử đơn vị, không cần hệ thống chạy
```

Ca chạy thật cho thành phần tùy chọn: `OPS_OPTIONAL=1`, `SEARCH_OPTIONAL=1`, `RESTORE_TEST=1` (xem VAN_HANH.md và TRI_TUE.md). Chi tiết từng ca: [KIEM_THU.md](KIEM_THU.md).

## Phát hành

Mỗi lần đẩy lên `main` là một phiên bản SemVer mới: cập nhật `CHANGELOG.md`, `web/package.json`, gắn thẻ `vX.Y.Z`, tạo bản phát hành kèm `.tar.gz`. Quy trình chi tiết: [CONTRIBUTING.md](../CONTRIBUTING.md). Image container được GitHub Actions đưa lên GitHub Packages khi có thẻ phiên bản.

## Các điểm vào của cổng API

Mọi yêu cầu đi qua APISIX (cổng 9080), nơi kiểm JWT, giới hạn tần suất và CORS trước khi tới dịch vụ phía sau.

| Đường dẫn | Dùng để | Ai gọi |
|---|---|---|
| `/v1/graphql` | Dữ liệu qua Hasura, phân quyền theo dòng | mọi người dùng đã đăng nhập |
| `/files` | Đính kèm và tải tệp (quét mã độc, tối đa 10 MB) | người có quyền với hồ sơ |
| `/search`, `/ask` | Tìm kiếm và hỏi đáp có kiểm quyền | mọi người dùng (cần profile `search`) |
| `/events` | Kênh thời gian thực (SSE), chỉ đẩy nhịp rỗng | mọi người dùng |
| `/ingest` | Nạp hàng loạt hồ sơ CSV/JSON | người dùng nạp, bằng quyền của mình |
| `/archive`, `/archive/verify`, `/lineage` | Kho lạnh, kiểm chứng sổ cái, phả hệ dữ liệu | giám đốc |
| `/sensors` | Đăng ký cảm biến (giám đốc), xem trạng thái (trưởng phòng, giám đốc) | người dùng |
| `/telemetry/<mã>` | Thiết bị gửi số đo | cảm biến, bằng token thiết bị riêng |
| `/auth/*` | Đăng nhập (Keycloak) | trình duyệt |
