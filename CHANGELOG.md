<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), đánh số phiên bản theo [SemVer](https://semver.org/lang/vi/).

## [Unreleased]

## [1.7.0] - 2026-11-15

### Added
- Sơ đồ quy trình (`ProcessFlow.vue`, SVG, không thư viện ngoài) trong trang hồ sơ và trang Quy trình: bước đang chờ sáng lên, bước đã ký, bị từ chối hoặc bỏ qua (nét đứt kèm đường vòng) có trạng thái bằng chữ và ký hiệu chứ không chỉ màu; hồ sơ chuyển bước thì sơ đồ đổi theo ở lần cập nhật kế tiếp.
- Mức trưởng thành H-P-D-I (điểm 0 đến 100 cho từng không gian) ở trang Số liệu, tính từ dữ liệu thật, công thức công bố ở `docs/HUONG_DAN.md`; dưới 5 hồ sơ thì báo chưa đủ dữ liệu.
- `scripts/demo-reset.sh`: dựng lại hệ thống sạch và nạp dữ liệu mẫu cho mỗi lần diễn tập.
- Kiểm thử đơn vị `flow.test.js`, `maturity.test.js`.

### Changed
- Trạng thái từng bước tách thành `web/src/flow.js`, dùng chung cho hàng ô ký và sơ đồ.
- Dữ liệu mẫu có thêm 2 hồ sơ "Xin tạm ứng" (tổng 11) để số liệu của quy trình này đủ mẫu.

## [1.6.4] - 2026-11-15

### Fixed
- Chạy kiểm thử trên bản giải nén từ tarball (không có thư mục `.git`): các ca cần lịch sử commit hoặc thẻ (LUAT-02, 03, 05, PoF-1.2, 3.2, 3.4, 6.2) tự bỏ qua kèm lý do thay vì báo đỏ; `pof.test.js` không còn sập khi nạp.

## [1.6.3] - 2026-11-15

### Fixed
- Tìm kiếm: chỉ đánh dấu tài liệu là đã nạp sau khi Meilisearch xử lý xong tác vụ; tác vụ lỗi thì báo và lần sau thử lại (trước đây lỗi âm thầm, tài liệu không bao giờ được nạp lại).
- Tìm kiếm: hai lần nạp không còn chạy chồng nhau; tệp không phải dạng chữ chỉ xét một lần; tệp đọc lỗi chỉ thử tối đa 3 lần thay vì mỗi 10 giây mãi.

## [1.6.2] - 2026-11-15

### Fixed
- Ca PoF-1.3 không còn bị kẹt trong CI khi lần chạy trước trên `main` đang đỏ: trong CI chỉ đòi từng có lần chạy xanh gần đây, chạy cục bộ vẫn đòi lần gần nhất phải xanh.

## [1.6.1] - 2026-11-15

### Fixed
- Tìm kiếm: chỉ mục đôi khi được tạo không có khóa chính (hai bước tạo chỉ mục và đặt cấu hình chạy đua nhau), khiến Meilisearch từ chối ngầm mọi lần nạp tài liệu và ca I-SEARCH chập chờn trên CI. Nay chỉ định khóa chính ngay ở lệnh nạp.
- Tìm kiếm: chỉ mục bị mất thì tự dựng lại và nạp lại; một tệp đọc lỗi không còn chặn cả lần nạp; mọi lời gọi Hasura và S3 có hạn chờ; nhật ký ghi rõ mã lỗi.

## [1.6.0] - 2026-11-15

Tài liệu và trình diễn.

### Added
- `docs/HUONG_DAN.md`: hướng dẫn người dùng theo bốn không gian H/P/D/I.
- `docs/KY_THUAT.md`: sổ tay kỹ thuật và vận hành (dịch vụ, khởi động, cấu hình, dữ liệu nằm đâu, bảng sự cố thường gặp).
- `docs/KICH_BAN_DEMO.md`: kịch bản trình diễn 15 phút theo từng cảnh, danh sách chuẩn bị, câu hỏi thường gặp của ban giám khảo, xử lý sự cố trên sân khấu.
- `docs/slides/index.html`: slide 12 trang, một tệp HTML không thư viện ngoài.
- Ca kiểm thử LUAT-12: tài liệu có đủ, README dẫn tới, liên kết không gãy.

### Changed
- `docs/architecture.md` và README cập nhật theo hiện trạng (quét mã độc, MFA, TLS, giám sát, hỏi đáp có kiểm quyền, Kanban, lịch, vi/en); phần "Thử trong 3 phút" dùng đúng tên màn hình hiện tại; mục Định hướng phát triển và các việc gắn nhãn `good first issue`.

## [1.5.0] - 2026-11-15

Không gian [I]: hỏi đáp tài liệu có dẫn nguồn và kiểm quyền.

### Added
- **Hỏi đáp tài liệu** (`/hoi-dap`, `POST /ask`) và **tìm kiếm toàn văn** (`POST /search`) trên hồ sơ và tệp đính kèm dạng văn bản, bằng Meilisearch (profile `search`). Mỗi kết quả được Hasura kiểm lại bằng token của người hỏi, nên người không có quyền không bao giờ thấy nội dung, cả trong kết quả lẫn trong ngữ cảnh gửi cho AI. AI chỉ trả lời từ các đoạn tìm được, dẫn số nguồn.
- **Ollama** (profile `ai`) để chạy mô hình AI tại chỗ; hướng dẫn trong `docs/TRI_TUE.md`.
- Ca kiểm thử `tests/search.test.js` (I-SEARCH-01..05), kiểm thử đơn vị `search.test.js` và `snippet.test.js`.

### Chưa làm
- Tìm kiếm véc-tơ ngữ nghĩa (Qdrant), đọc PDF và OCR, vòng hỏi-đáp làm rõ khi AI sinh quy trình (GEN-10).

## [1.4.0] - 2026-11-15

An toàn và vận hành.

### Added
- **MFA**: trưởng phòng và giám đốc phải nhập OTP (TOTP) sau mật khẩu; nhân viên và kế toán chỉ cần mật khẩu (luồng `browser-mfa` của Keycloak, ca T1-SSO-10 đi qua trang đăng nhập thật).
- **Sao lưu và khôi phục**: `scripts/backup.sh`, `scripts/restore.sh` (ba cơ sở dữ liệu và kho tệp, kiểm mã băm trước khi ghi đè), ca `tests/restore.test.js` chạy trọn vòng trên hệ thống thật.
- **TLS tại biên** bằng Caddy và **giám sát** bằng Prometheus (số đo của cổng API), tách trong `docker-compose.optional.yml` với profile `tls` và `monitoring`; bản lõi không đổi.
- `docs/VAN_HANH.md`: hướng dẫn vận hành, `tests/ops.test.js`.

### Changed
- Keycloak tin header `X-Forwarded-*` để chạy sau proxy TLS.
- Ca Z-05 và Z-06 từ "todo" thành ca có kiểm chứng.

### Chưa làm
- Két bí mật (OpenBao), WAF, ẩn thông tin định danh (PII), sao lưu tự động theo lịch, Grafana (giấy phép AGPL-3.0, trái chính sách của dự án).

## [1.3.0] - 2026-11-15

Không gian [H] Con người số hoàn thiện hơn và giao diện nói rõ kiến trúc H-P-D-I.

### Added
- **Bảng công việc** (`/bang`): hồ sơ xếp cột Kanban theo tình trạng, cột "Chờ bạn" là việc riêng của người đăng nhập.
- **Lịch** (`/lich`): lưới tháng, hồ sơ theo ngày gửi và ngày hoàn tất.
- **Trang cá nhân và trung tâm thông báo** (`/ca-nhan`): thông tin, số hồ sơ, thông báo suy ra từ hồ sơ thật.
- Nhãn không gian **H / P / D / I** cạnh từng mục điều hướng.
- Đa ngôn ngữ **vi/en** không thêm thư viện (`web/src/i18n.js`): khung điều hướng và ba trang mới đã dịch; các trang cũ còn tiếng Việt.
- **ESLint** (`npm run lint`) chạy trong CI trước khi dựng frontend; kiểm thử đơn vị bộ khoá dịch.

### Changed
- Ca kiểm thử H-03 từ "todo" thành ca thật.

### Chưa làm
- Thông báo vẫn lấy bằng hỏi lại mỗi 4 giây, chưa phải Hasura subscription (gateway chưa nhận token qua WebSocket).

## [1.2.1] - 2026-11-15

Bản rà soát đúng luật: kiểm các điều khoản của Thể lệ và Đề thi ngoài bảng điểm PoF, và chuẩn bị hồ sơ nộp bài.

### Added
- `tests/luat.test.js` (LUAT-01 đến LUAT-11): kho công khai và nhận diện giấy phép, không tài liệu của BTC trong kho, lịch sử commit và danh sách người đóng góp không có công cụ/bot, không bí mật trong toàn bộ lịch sử, image container công khai, bản phát hành có ghi chú, Tầng 1 không giao diện, dựng bằng một lệnh, hồ sơ nộp bài.
- `docs/NOP_BAI.md`: câu hỏi hạn nộp gửi BTC, danh sách điều kiện đội, mẫu thư nộp bài đúng quy cách, danh sách kiểm tra trước khi gửi.

### Changed
- `docs/KIEM_THU.md` bổ sung nhóm LUAT, kết quả cài sạch từ bản phát hành và quét bí mật.

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
