<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), đánh số phiên bản theo [SemVer](https://semver.org/lang/vi/).

## [Unreleased]

## [0.1.0] - 2026-11-14

Bản phát hành đầu tiên: nền tảng lõi chạy được từ đầu đến cuối và bộ sinh ứng dụng quy trình.

### Added
- Kho quy trình mẫu `library/` (tạm ứng, nghỉ phép, mua thiết bị, đề nghị thanh toán) và lệnh nạp dữ liệu mẫu cho bản demo.
- Khung dự án: LICENSE (Apache-2.0), README, CONTRIBUTING, THIRD_PARTY, CI, mẫu Issue/PR.
- Docker Compose khung tầng 1: PostgreSQL, Keycloak, Hasura, APISIX, lưu trữ đối tượng S3.
- **Bộ sinh ứng dụng quy trình**: quản lý khai báo một "bản mô tả ứng dụng" (các trường dữ liệu + các bước xử lý theo vai trò, có điều kiện); hệ thống tự biên dịch thành quy trình BPMN trên Flowable và view dữ liệu phẳng cho BI, không cần viết mã.
- **Ứng dụng web** (Vue 3, `web/`): đăng nhập SSO; trang "Tạo ứng dụng" (mô tả bằng lời → AI phác thảo → chỉnh sửa → xem sơ đồ → xuất bản); form gửi hồ sơ tự sinh từ bản mô tả; hộp việc theo vai trò với sơ đồ quy trình hiển thị bước đang chờ, bước đã qua, bước bị bỏ qua.
- Không ai được tự xử lý hồ sơ do chính mình gửi.
- **Trợ lý AI** (tùy chọn): mô tả quy trình bằng tiếng Việt → bản mô tả ứng dụng kèm câu hỏi làm rõ, để con người xem lại trước khi xuất bản. Dùng mọi máy chủ tương thích OpenAI (Ollama, vLLM, Mistral...).
- Rào chắn dữ liệu tại cơ sở dữ liệu: hồ sơ gửi vào phải khớp kiểu và trường bắt buộc đã khai báo.
- Nhật ký hành động chỉ-thêm trên từng hồ sơ; vai trò `director`, `accountant` và tài khoản mẫu tương ứng.
- Schema không gian [H] (project, task, document) và phân quyền theo dòng trong Hasura.
- Realm Keycloak `dxlab`: client `dxlab-app` (PKCE) và tài khoản mẫu; Hasura xác thực JWT bằng JWKS của Keycloak.
- Flowable REST 7.2.0 làm động cơ quy trình; dịch vụ `workflow-bridge` biên dịch ứng dụng và nối sự kiện Hasura với Flowable.
- Gateway kiểm tra JWT của Keycloak ngay tại biên (thiếu token trả 401), có CORS và giới hạn tần suất cho `/v1/graphql`.
- Smoke test `scripts/smoke.sh` chạy trong CI: đăng nhập → gateway → định nghĩa ứng dụng → 3 nhánh quy trình → phân quyền → view BI.

### Changed
- Thay MinIO bằng SeaweedFS 4.53 (Apache-2.0) vì image MinIO cộng đồng không còn trên Docker Hub.
