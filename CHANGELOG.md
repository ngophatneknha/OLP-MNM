<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), đánh số phiên bản theo [SemVer](https://semver.org/lang/vi/).

## [Unreleased]

## [1.2.0] - 2026-11-15

### Added
- **GitHub Packages**: mỗi thẻ phiên bản tự động phát hành hai image lên `ghcr.io` (`dxlab-web`, `dxlab-workflow-bridge`) kèm nhãn nguồn và giấy phép; thêm `services/workflow-bridge/Dockerfile`. Cài từ mã nguồn bằng `docker compose` vẫn là cách chuẩn.

## [1.1.0] - 2026-11-15

Bản kiểm thử theo tiêu chuẩn: thay smoke test bằng bộ kiểm thử đối chiếu trực tiếp với đề thi và thể lệ, và vá các lỗi mà bộ kiểm thử tìm ra.

### Added
- Bộ kiểm thử `tests/` chạy trên hệ thống thật: Tầng 1 (SSO, cổng API, headless, dữ liệu cấu trúc và phi cấu trúc, luồng BPMN), không gian H-P-D-I (kể cả tấn công vào bộ sinh ứng dụng và gọi AI thật) và sáu tiêu chí PoF của thể lệ (kho, giấy phép, bản phát hành, dựng từ bản phát hành, thư viện đính kèm, tài liệu). Báo cáo: `docs/KIEM_THU.md`.
- **Trạm kiểm dịch mã độc ClamAV**: mọi tệp tải lên được quét trước khi lưu; tệp nhiễm bị từ chối (422), trạm hỏng thì từ chối luôn (503) thay vì cho qua.
- Chống dò mật khẩu ở Keycloak (khóa tạm thời sau 8 lần sai).
- Tiêu đề bảo mật cho ứng dụng web (CSP, chống nhúng khung, nosniff, Referrer-Policy, Permissions-Policy).
- Mẫu pull request, mẫu đề xuất tính năng, `CODE_OF_CONDUCT.md`.

### Security
- Nhật ký hành động trên hồ sơ **bất biến ở tầng cơ sở dữ liệu**: không UPDATE, DELETE hay TRUNCATE được, kể cả bằng quyền chủ sở hữu.
- Từ chối hồ sơ bắt buộc có lý do ở cơ sở dữ liệu, không chỉ ở giao diện (trước đây gọi thẳng API vẫn từ chối được không lý do).

### Changed
- CI chạy bộ kiểm thử thật thay cho smoke test; `scripts/smoke.sh` bị xóa.
- Kiểm tra phiên bản phát hành chấp nhận phiên bản mới hơn trên nhánh đang làm (thẻ được gắn sau khi gộp).

## [1.0.0] - 2026-11-15

Bản ổn định đầu tiên: quy trình như mã nguồn mở, giao diện làm lại, tệp đính kèm, số liệu và trợ lý AI "thử việc".

### Added
- **Trợ lý AI "thử việc"**: mỗi bước duyệt có bốn nấc tự chủ (người làm, chạy bóng, gợi ý, tự duyệt). Trợ lý cho ý kiến kèm lý do dựa trên hồ sơ và các quyết định gần đây của người ở bước đó; ở nấc 3 người duyệt thấy gợi ý, ở nấc 4 trợ lý tự duyệt hồ sơ hợp lệ còn từ chối luôn do người quyết.
- Nâng nấc bị cơ sở dữ liệu chặn nếu thiếu bằng chứng: chỉ giám đốc, từng nấc một, cần ≥ 10 quyết định thật của người và ≥ 90% khớp; dữ liệu mẫu không được tính. Hạ nấc ai có quyền cũng làm được.
- Trang "Trợ lý AI" cho trưởng phòng và giám đốc: nấc hiện tại, bằng chứng khớp, nâng/hạ nấc, các lần gần đây trợ lý so với người.
- `seed.js --ai-demo`: chạy bóng trợ lý trên 12 hồ sơ có người quyết định thật.

### Added (đã phát hành trước đó trong nhánh chính)
- **Tệp đính kèm hồ sơ** lưu trong kho S3 (SeaweedFS), đi qua cổng API; quyền xem/đính kèm theo đúng quyền của hồ sơ; tải về luôn dạng tệp đính kèm. Chọn tệp ngay trong form gửi hồ sơ hoặc thêm ở trang hồ sơ (tối đa 10 MB).
- Trang **Tài liệu** (không gian [H]): mọi tệp tôi được xem, có tìm kiếm.
- Trang **Số liệu** (không gian [D]) cho trưởng phòng và giám đốc: số hồ sơ, thời gian xử lý trung bình, tỷ lệ duyệt, bước chậm nhất, hồ sơ chờ lâu nhất; tính từ dữ liệu thật bằng mã có kiểm thử.
- Dữ liệu mẫu có thời gian dàn ra nhiều ngày để số liệu có ý nghĩa.

### Security
- Chỉ còn ba cổng mở ra máy chủ (web, cổng API, đăng nhập); Hasura, Flowable, kho S3 chỉ trong mạng nội bộ; tắt console Hasura; Keycloak chạy chế độ production.
- Ứng dụng web không còn được đăng nhập bằng mật khẩu trực tiếp; việc đó chuyển sang client riêng `dxlab-cli` cho smoke test và nạp dữ liệu mẫu.
- Quản lý và giám đốc xem được mọi hồ sơ để điều hành; các vai trò khác vẫn chỉ thấy hồ sơ liên quan tới mình.

### Changed
- Giấy phép các thành phần được đối chiếu với kho chính thức và đánh dấu đã xác minh trong `THIRD_PARTY.md`, kèm kết luận về tương thích.
- Tài liệu gửi giảng viên được cập nhật cho khớp công nghệ thực tế.

### Removed
- Các bảng `project`, `task`, `document` chưa được dùng (tệp đính kèm thay cho `document`).

### Changed
- **Làm lại toàn bộ giao diện theo hướng "bàn giấy văn phòng"**: màu mực bút bi xanh, con dấu đỏ khi duyệt, giấy nhớ cho lời nhắn của trợ lý; Be Vietnam Pro cho chữ, Noto Serif cho tên văn bản và chữ ký; biểu tượng Lucide.
- Trang chủ "Bàn làm việc" có lời chào, tóm tắt việc hôm nay, việc chờ bạn xử lý (duyệt ngay tại chỗ) và lối tắt gửi hồ sơ.
- Mỗi hồ sơ có số ("hồ sơ số 27") và trang riêng: nội dung, hàng ô ký (ai đã ký, ai đang chờ, bước nào không cần), nhật ký kể bằng câu.
- Từ chối hồ sơ bắt buộc ghi lý do để người gửi biết phải sửa gì.
- Soạn quy trình thành 3 bước dẫn dắt (bắt đầu, soạn, xuất bản); quy trình có mô tả ngắn và nhóm.
- Thanh điều hướng dưới đáy trên điện thoại; thông báo ngắn sau mỗi hành động; lời báo lỗi nói rõ cách khắc phục.

### Added
- **Quy trình là mã nguồn mở**: mỗi quy trình có lịch sử phiên bản bất biến kèm ghi chú thay đổi; sửa một quy trình đang chạy phải mở *đề xuất thay đổi*, được kiểm tra tự động, chạy thử trên các hồ sơ đã có (bao nhiêu hồ sơ đổi đường đi, thời gian chờ ước tính), và phải do người khác (giám đốc) chấp nhận mới phát hành.
- Trang "Quy trình": xem sơ đồ, so sánh thay đổi bằng lời thường, lịch sử phiên bản, góp ý và báo lỗi quy trình — mọi vai trò đều xem được.
- Bắt đầu từ kho quy trình mẫu ngay trong trang "Tạo ứng dụng"; tải quy trình đang soạn thành tệp JSON đúng định dạng `library/` để đóng góp lại.
- Hồ sơ ghi nhận phiên bản quy trình lúc gửi và hiển thị theo đúng phiên bản đó; nhật ký ghi tên người thực hiện.

### Changed
- Trưởng phòng không còn sửa thẳng được quy trình đã xuất bản (chỉ tạo mới hoặc mở đề xuất).

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
