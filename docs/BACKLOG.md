<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Backlog dự án DX-Lab Project Hub

Danh sách chi tiết công việc để kiểm soát và theo dõi tiến độ OLP PMNM 2026.
Mốc cứng: **nộp bài 06/12/2026**, **chung kết 10/12/2026**.

## Cách dùng

- Mỗi dòng là một đầu việc: `ID — Tên — Người phụ trách · Tuần · Mức ưu tiên`.
- **Người phụ trách:** `A` Platform & Security · `B` Data & Workflow · `C` Product, Frontend & Docs (xem [kế hoạch](../README.md)). `ALL` = cả đội.
- **Ưu tiên:** `MVP` = bắt buộc theo đề · `Stretch` = làm nếu còn thời gian (quyết định ở Tuần 5).
- Dòng thụt lề bên dưới là **tiêu chí hoàn thành**. Mọi việc còn phải thỏa *Definition of Done* chung (mục dưới).
- Trạng thái chi tiết theo dõi trên **GitHub Issues/Projects**; đánh dấu `[x]` tại đây trong buổi review hàng tuần rồi chạy `python scripts/backlog.py progress --write` để cập nhật bảng tiến độ.
- Tạo Issues/labels/milestones từ file này: `python scripts/backlog.py issues --apply` (cần `gh` đã đăng nhập; mặc định chỉ chạy thử).

**Definition of Done chung:** có mã/tài liệu + tiêu đề SPDX + chạy được bằng `docker compose up` + PR đã được 1 người khác review + CI xanh + cập nhật CHANGELOG nếu thay đổi người dùng thấy được.

## Tiến độ

<!-- progress:start -->
| Nhóm | Hoàn thành | MVP | Tiến độ |
|---|---|---|---|
| PM — Quản trị dự án | 1/12 | 1/12 | █░░░░░░░░░ 8% |
| POF — Tiêu chí PoF (50 điểm, chấm qua kho mã) | 2/12 | 2/12 | ██░░░░░░░░ 16% |
| ID — Tầng 1: Định danh & Cổng API (Keycloak, APISIX) | 0/9 | 0/7 | ░░░░░░░░░░ 0% |
| DA — Tầng 1: Dữ liệu (PostgreSQL, Hasura, MinIO) | 0/9 | 0/8 | ░░░░░░░░░░ 0% |
| WF — Tầng 1: Workflow (Flowable) | 0/6 | 0/5 | ░░░░░░░░░░ 0% |
| UI — Tầng 2: Ứng dụng H-P-D-I (Nuxt 3) | 0/11 | 0/10 | ░░░░░░░░░░ 0% |
| BI — Không gian [D]: Dashboard & tìm kiếm | 0/4 | 0/3 | ░░░░░░░░░░ 0% |
| AI — Không gian [I]: Trí tuệ nhân tạo (Stretch) | 0/5 | 0/0 | ░░░░░░░░░░ 0% |
| OPS — Hạ tầng & vận hành | 0/4 | 0/2 | ░░░░░░░░░░ 0% |
| DOC — Tài liệu & trình diễn | 0/8 | 0/8 | ░░░░░░░░░░ 0% |
| RISK — Rủi ro cần theo dõi | 0/5 | 0/5 | ░░░░░░░░░░ 0% |
| **Tổng** | **3/85** | **3/72** | ░░░░░░░░░░ 3% |
<!-- progress:end -->

## Mốc thời gian

| Tuần | Hạn | Cột mốc |
|---|---|---|
| 0 | 18/10 | Repo, license, backlog, chốt stack |
| 1 | 25/10 | Đăng nhập SSO end-to-end |
| 2 | 01/11 | **Release v0.1.0** (skeleton + build guide) |
| 3 | 08/11 | Luồng phê duyệt chạy được |
| 4 | 15/11 | **v0.3.0** H-P-D hoàn chỉnh; đối chiếu đề chính thức |
| 5 | 22/11 | **v0.5.0**; quyết định cắt/giữ Stretch |
| 6 | 29/11 | **FEATURE FREEZE** |
| 7 | 06/12 | **v1.0.0 + NỘP BÀI** |
| 8 | 10/12 | **Chung kết** |

---

## PM — Quản trị dự án

- [x] **PM-00** Dựng khung repo (LICENSE, README, CI, compose khung, mẫu Issue) — `A` · Tuần 0 · MVP
  - Hoàn thành khi: `reuse lint` xanh, đã push lên `main`.
- [ ] **PM-01** Chốt giấy phép dự án cùng giảng viên (đề xuất Apache-2.0) — `C` · Tuần 0 · MVP
  - Hoàn thành khi: quyết định ghi vào `docs/architecture.md`; nếu đổi license thì sửa LICENSE + header + `REUSE.toml`.
- [ ] **PM-02** Bật branch protection cho `main` (PR bắt buộc, CI xanh, 1 review) — `A` · Tuần 0 · MVP
  - Hoàn thành khi: không thể push trực tiếp vào `main`.
- [ ] **PM-03** Tạo labels, milestones và bảng GitHub Projects (Kanban + sprint) — `C` · Tuần 0 · MVP
  - Hoàn thành khi: chạy `scripts/backlog.py issues --apply`, bảng Projects có cột Todo/Doing/Review/Done.
- [ ] **PM-04** Mời 2 thành viên còn lại, gán vai trò A/B/C và người dự phòng — `ALL` · Tuần 0 · MVP
  - Hoàn thành khi: bảng phân công ghi tên thật trong README.
- [ ] **PM-05** Hỏi BTC (Telegram) xác nhận hạn nộp: đề ghi 06/12/2025, thể lệ ghi 2026 — `C` · Tuần 0 · MVP
  - Hoàn thành khi: có xác nhận bằng văn bản, cập nhật mốc trong file này.
- [ ] **PM-06** Hoàn tất đăng ký đội thi qua trường, xác nhận giảng viên hướng dẫn — `C` · Tuần 0 · MVP
  - Hoàn thành khi: có xác nhận đăng ký của trường; nhớ ≤ 3 thí sinh/đội.
- [ ] **PM-07** Chốt ứng dụng demo và storyline H→P→D(→I) — `C` · Tuần 0 · MVP
  - Hoàn thành khi: storyline 1 trang trong `docs/`, cả đội đồng ý.
- [ ] **PM-08** Cài Docker, kiểm tra cấu hình máy từng người (RAM, CPU) — `ALL` · Tuần 0 · MVP
  - Hoàn thành khi: mỗi người chạy được `docker compose up`; ghi lại cấu hình để quyết định Stretch AI.
- [ ] **PM-09** Đối chiếu đề thi chính thức (công bố 11/2026) với thiết kế, cập nhật backlog — `A` · Tuần 4 · MVP
  - Hoàn thành khi: danh sách thay đổi yêu cầu được tạo thành Issues.
- [ ] **PM-10** Quyết định cắt/giữ các mục Stretch dựa trên tiến độ thực tế — `ALL` · Tuần 5 · MVP
  - Hoàn thành khi: mục Stretch bị cắt được ghi vào "Định hướng phát triển".
- [ ] **PM-11** Gate review với giảng viên (demo 10 phút + rà checklist PoF), lặp mỗi 2 tuần — `C` · Tuần 2 · MVP
  - Hoàn thành khi: biên bản ngắn sau mỗi lần review (có thể là Issue đóng).

## POF — Tiêu chí PoF (50 điểm, chấm qua kho mã)

- [x] **POF-01** SPDX header mọi file + `reuse lint` trong CI (hiện trạng) — `C` · Tuần 0 · MVP
  - Hoàn thành khi: CI fail nếu có file thiếu giấy phép. *(Mỗi file mới vẫn phải có header — kiểm tra liên tục.)*
- [x] **POF-02** Mẫu Issue báo lỗi để bug tracker dùng thật — `C` · Tuần 0 · MVP
  - Hoàn thành khi: có `.github/ISSUE_TEMPLATE/bug_report.md`; bug thật được ghi vào Issues trong suốt dự án.
- [ ] **POF-03** Cố định phiên bản mọi image trong compose (hiện MinIO dùng `latest`) — `A` · Tuần 1 · MVP
  - Hoàn thành khi: không còn tag `latest`.
- [ ] **POF-04** Cấu hình hoàn toàn qua `.env`/file cấu hình, không phải sửa tay header/mã — `A` · Tuần 1 · MVP
  - Hoàn thành khi: máy mới chỉ cần `cp .env.example .env` rồi chạy.
- [ ] **POF-05** Release **v0.1.0** theo SemVer, định dạng `.tar.gz` (không zip/rar) — `A` · Tuần 2 · MVP
  - Hoàn thành khi: GitHub Release có ghi chú và tệp `.tar.gz`; dùng git-cliff/Conventional Commits để sinh CHANGELOG.
- [ ] **POF-06** Hướng dẫn "Build from source" và kiểm thử trên máy sạch (lặp ở Tuần 5 và 7) — `A` · Tuần 2 · MVP
  - Hoàn thành khi: người chưa từng tham gia làm theo README thành công, không cần hỏi.
- [ ] **POF-07** Rà giấy phép từng thành phần, điền cột "Đã xác minh" trong `THIRD_PARTY.md` — `B` · Tuần 1 · MVP
  - Hoàn thành khi: mọi thành phần đã đối chiếu trên repo chính thức; loại bỏ thành phần không OSI-approved.
- [ ] **POF-08** Kiểm tra tương thích giấy phép (Apache-2.0 vs các dịch vụ AGPL chạy tách container) — `B` · Tuần 7 · MVP
  - Hoàn thành khi: kết luận bằng văn bản trong `THIRD_PARTY.md`, đã hỏi giảng viên nếu có nghi ngại.
- [ ] **POF-09** Bảng liệt kê thư viện/gói đính kèm, không sửa mã gói đính kèm — `B` · Tuần 7 · MVP
  - Hoàn thành khi: `THIRD_PARTY.md` đầy đủ phiên bản và giấy phép.
- [ ] **POF-10** Release **v1.0.0** trước hạn nộp — `A` · Tuần 7 · MVP
  - Hoàn thành khi: tạo trước 06/12, có `.tar.gz`, CHANGELOG đầy đủ.
- [ ] **POF-11** Gửi email nộp bài đúng mẫu (tiêu đề, thành viên, GVHD, link kho) — `C` · Tuần 7 · MVP
  - Hoàn thành khi: gửi tới `olpvietnam@vaip.vn` và `thuky@vfossa.vn` trước 17:00 hạn nộp; lưu lại bằng chứng.
- [ ] **POF-12** Commit đều đặn và công khai từ đầu, tránh đẩy dồn cuối kỳ — `ALL` · Tuần 1 · MVP
  - Hoàn thành khi: lịch sử commit phân bố theo tuần, có đóng góp của cả 3 thành viên.

## ID — Tầng 1: Định danh & Cổng API (Keycloak, APISIX)

- [ ] **ID-01** Chạy compose thực tế, sửa lỗi cấu hình (compose chưa từng được chạy thử) — `A` · Tuần 1 · MVP
  - Hoàn thành khi: mọi container healthy; ghi lại lỗi gặp phải vào Issues.
- [ ] **ID-02** Keycloak realm `dxlab`: client cho ứng dụng, role staff/manager/admin, user mẫu — `A` · Tuần 1 · MVP
  - Hoàn thành khi: realm export nằm trong `infra/keycloak/realm/`, dựng lại được từ đầu.
- [ ] **ID-03** Gateway: route `/v1/graphql`, `/auth`, `/storage`, `/workflow` — `A` · Tuần 2 · MVP
  - Hoàn thành khi: ứng dụng chỉ gọi qua cổng 9080.
- [ ] **ID-04** Gateway xác thực JWT của Keycloak (OIDC) cho route nghiệp vụ — `A` · Tuần 2 · MVP
  - Hoàn thành khi: gọi không token trả 401, có token hợp lệ trả 200.
- [ ] **ID-05** Hasura nhận JWT từ Keycloak (JWKS) thay khóa HS256 tạm — `A` · Tuần 2 · MVP
  - Hoàn thành khi: claim role của Keycloak ánh xạ đúng sang role Hasura.
- [ ] **ID-06** Rate limiting và CORS ở gateway — `A` · Tuần 2 · MVP
  - Hoàn thành khi: vượt ngưỡng trả 429; chỉ origin ứng dụng được phép.
- [ ] **ID-07** Hardening: bỏ `start-dev`, TLS qua Caddy/Traefik, không mở cổng nội bộ ra ngoài — `A` · Tuần 4 · MVP
  - Hoàn thành khi: chỉ gateway/TLS được publish; mật khẩu mặc định bị loại bỏ.
- [ ] **ID-08** Bật MFA (OTP) cho role manager/admin — `A` · Tuần 5 · Stretch
  - Hoàn thành khi: manager đăng nhập phải nhập OTP.
- [ ] **ID-09** Quét tệp tải lên bằng ClamAV — `A` · Tuần 6 · Stretch
  - Hoàn thành khi: tệp nhiễm mã độc mẫu (EICAR) bị từ chối.

## DA — Tầng 1: Dữ liệu (PostgreSQL, Hasura, MinIO)

- [ ] **DA-01** Thiết kế schema: user_profile, project, task, document, request, request_history — `B` · Tuần 0 · MVP
  - Hoàn thành khi: sơ đồ ER trong `docs/`, được A và C xem lại.
- [ ] **DA-02** Migration SQL và Hasura metadata lưu trong repo — `B` · Tuần 1 · MVP
  - Hoàn thành khi: dựng lại DB từ đầu chỉ bằng `docker compose up`.
- [ ] **DA-03** Phân quyền Hasura theo role, row-level (nhân viên chỉ thấy việc của mình) — `B` · Tuần 1 · MVP
  - Hoàn thành khi: có test truy vấn chứng minh staff không đọc được dữ liệu người khác.
- [ ] **DA-04** Seed dữ liệu mẫu đủ đẹp cho demo — `B` · Tuần 2 · MVP
  - Hoàn thành khi: một lệnh nạp lại dữ liệu mẫu.
- [ ] **DA-05** MinIO: bucket, presigned URL upload/download qua gateway — `B` · Tuần 2 · MVP
  - Hoàn thành khi: tải tệp lên và xuống được với quyền đúng.
- [ ] **DA-06** Bảng `document` liên kết metadata với đối tượng trong MinIO — `B` · Tuần 2 · MVP
  - Hoàn thành khi: xóa document thì xử lý đối tượng tương ứng nhất quán.
- [ ] **DA-07** View/bảng phẳng cho BI (không phụ thuộc cấu trúc nghiệp vụ) — `B` · Tuần 4 · MVP
  - Hoàn thành khi: Metabase đọc được view mà không cần quyền ghi.
- [ ] **DA-08** Script sao lưu/khôi phục (pg_dump + mc mirror) — `B` · Tuần 5 · MVP
  - Hoàn thành khi: khôi phục thành công trên môi trường sạch, ghi trong runbook.
- [ ] **DA-09** Audit log bất biến bằng trigger ghi lịch sử thay đổi — `B` · Tuần 6 · Stretch
  - Hoàn thành khi: mọi thay đổi request/task có bản ghi lịch sử, không sửa/xóa được.

## WF — Tầng 1: Workflow (Flowable)

- [ ] **WF-01** Thêm Flowable REST vào compose — `B` · Tuần 3 · MVP
  - Hoàn thành khi: container healthy, truy cập qua gateway có xác thực.
- [ ] **WF-02** Quy trình BPMN phê duyệt yêu cầu 1 cấp (staff → manager) — `B` · Tuần 3 · MVP
  - Hoàn thành khi: file `.bpmn` nằm trong repo, tự deploy khi khởi động.
- [ ] **WF-03** Hasura event trigger khởi chạy tiến trình khi có request mới — `B` · Tuần 3 · MVP
  - Hoàn thành khi: tạo request → tiến trình tự khởi tạo.
- [ ] **WF-04** Callback cập nhật trạng thái request khi quản lý duyệt/từ chối — `B` · Tuần 3 · MVP
  - Hoàn thành khi: trạng thái trong DB khớp trạng thái tiến trình.
- [ ] **WF-05** Thông báo realtime khi có người duyệt (Hasura subscription) — `B` · Tuần 4 · MVP
  - Hoàn thành khi: giao diện người gửi cập nhật không cần tải lại trang.
- [ ] **WF-06** Quy trình phê duyệt 2 cấp / quy tắc theo giá trị — `B` · Tuần 5 · Stretch
  - Hoàn thành khi: có ít nhất một nhánh điều kiện, cấu hình không cần sửa mã.

## UI — Tầng 2: Ứng dụng H-P-D-I (Nuxt 3)

- [ ] **UI-01** Khung Nuxt 3 + Tailwind, layout, đa ngôn ngữ vi/en — `C` · Tuần 1 · MVP
  - Hoàn thành khi: chạy trong compose, có Dockerfile.
- [ ] **UI-02** Đăng nhập OIDC với Keycloak (PKCE), đăng xuất, phân quyền theo role — `C` · Tuần 1 · MVP
  - Hoàn thành khi: đăng nhập SSO end-to-end; menu thay đổi theo role.
- [ ] **UI-03** [H] Bảng Kanban dự án và công việc — `C` · Tuần 2 · MVP
  - Hoàn thành khi: kéo thả đổi trạng thái, lưu qua GraphQL.
- [ ] **UI-04** [H] Quản lý tài liệu: tải lên, danh sách, tải xuống — `C` · Tuần 2 · MVP
  - Hoàn thành khi: dùng được với MinIO qua presigned URL.
- [ ] **UI-05** [P] Form gửi yêu cầu và danh sách yêu cầu của tôi — `C` · Tuần 3 · MVP
  - Hoàn thành khi: gửi yêu cầu → xuất hiện ở hàng chờ duyệt.
- [ ] **UI-06** [P] Màn hình duyệt dành cho quản lý — `C` · Tuần 3 · MVP
  - Hoàn thành khi: duyệt/từ chối có lý do, cập nhật cho người gửi.
- [ ] **UI-07** [D] Nhúng dashboard Metabase vào ứng dụng — `C` · Tuần 4 · MVP
  - Hoàn thành khi: dashboard hiển thị trong app, chỉ role được phép mới xem.
- [ ] **UI-08** [H] Trang cá nhân và trung tâm thông báo — `C` · Tuần 4 · MVP
  - Hoàn thành khi: nhận thông báo từ WF-05.
- [ ] **UI-09** Giao diện responsive/mobile, trải nghiệm thân thiện — `C` · Tuần 5 · MVP
  - Hoàn thành khi: dùng được trên điện thoại; người ngoài đội dùng thử không cần hướng dẫn.
- [ ] **UI-10** Gắn nhãn không gian H/P/D/I trên giao diện để giám khảo nhận ra kiến trúc — `C` · Tuần 5 · MVP
  - Hoàn thành khi: mỗi màn hình hiển thị nó thuộc không gian nào.
- [ ] **UI-11** [H] Wiki/ghi chú Markdown — `C` · Tuần 5 · Stretch
  - Hoàn thành khi: tạo, sửa, tìm trang wiki.

## BI — Không gian [D]: Dashboard & tìm kiếm

- [ ] **BI-01** Thêm Metabase vào compose, kết nối view dữ liệu — `B` · Tuần 4 · MVP
  - Hoàn thành khi: cấu hình lưu trong repo hoặc script tạo lại được.
- [ ] **BI-02** Dashboard: tiến độ dự án, khối lượng việc theo người, thời gian xử lý yêu cầu — `B` · Tuần 4 · MVP
  - Hoàn thành khi: số liệu đổi theo dữ liệu thật khi demo.
- [ ] **BI-03** Nhúng dashboard có ký bảo mật (signed embedding) — `B` · Tuần 4 · MVP
  - Hoàn thành khi: không truy cập được dashboard nếu không có token hợp lệ.
- [ ] **BI-04** Tìm kiếm toàn văn bằng Meilisearch — `B` · Tuần 5 · Stretch
  - Hoàn thành khi: tìm được task/tài liệu theo từ khóa, tôn trọng phân quyền.

## AI — Không gian [I]: Trí tuệ nhân tạo (Stretch)

- [ ] **AI-01** Ollama trong compose profile `ai` (tùy chọn) — `B` · Tuần 5 · Stretch
  - Hoàn thành khi: chạy được mô hình nhỏ trên máy yếu nhất của đội.
- [ ] **AI-02** Qdrant + pipeline nhúng tài liệu từ MinIO — `B` · Tuần 5 · Stretch
  - Hoàn thành khi: tài liệu mới tải lên được lập chỉ mục tự động.
- [ ] **AI-03** API hỏi đáp RAG qua gateway — `B` · Tuần 6 · Stretch
  - Hoàn thành khi: câu trả lời kèm trích dẫn tài liệu nguồn.
- [ ] **AI-04** RAG chỉ truy xuất tài liệu người hỏi có quyền xem — `B` · Tuần 6 · Stretch
  - Hoàn thành khi: có test chứng minh không rò rỉ giữa các role.
- [ ] **AI-05** Giao diện trợ lý ảo [I] — `C` · Tuần 6 · Stretch
  - Hoàn thành khi: hỏi đáp trên tài liệu nội bộ trong app.

## OPS — Hạ tầng & vận hành

- [ ] **OPS-01** CI: build và lint frontend — `A` · Tuần 2 · MVP
  - Hoàn thành khi: PR bị chặn nếu build lỗi.
- [ ] **OPS-02** CI: smoke test `docker compose up` + healthcheck — `A` · Tuần 3 · MVP
  - Hoàn thành khi: mỗi PR chứng minh hệ thống khởi động được từ đầu.
- [ ] **OPS-03** Giám sát Prometheus/Grafana — `A` · Tuần 6 · Stretch
  - Hoàn thành khi: dashboard sức khỏe các dịch vụ.
- [ ] **OPS-04** Bản demo online (VPS + domain + TLS) nếu có điều kiện — `A` · Tuần 7 · Stretch
  - Hoàn thành khi: giám khảo truy cập được qua Internet; vẫn có bản local dự phòng.

## DOC — Tài liệu & trình diễn

- [ ] **DOC-01** Cập nhật sơ đồ kiến trúc theo thực tế sau mỗi mốc — `C` · Tuần 2 · MVP
  - Hoàn thành khi: `docs/architecture.md` khớp với compose hiện hành.
- [ ] **DOC-02** Tài liệu người dùng (hướng dẫn từng không gian H/P/D/I) — `C` · Tuần 6 · MVP
  - Hoàn thành khi: có ảnh chụp màn hình, người ngoài làm theo được.
- [ ] **DOC-03** Tài liệu kỹ thuật và runbook vận hành (khởi động, sao lưu, xử lý sự cố) — `A` · Tuần 6 · MVP
  - Hoàn thành khi: điểm "phát triển bền vững" có tài liệu kỹ thuật chứng minh.
- [ ] **DOC-04** Kịch bản demo và dữ liệu mẫu cho trình diễn — `C` · Tuần 7 · MVP
  - Hoàn thành khi: kịch bản 6 phút từng bước, có người dẫn và người dự phòng.
- [ ] **DOC-05** Slide 15 phút (thiết kế, tính năng, kết quả, định hướng) — `C` · Tuần 7 · MVP
  - Hoàn thành khi: đúng khung 4 nội dung của đề.
- [ ] **DOC-06** Mục "Định hướng phát triển" và cách thu hút cộng đồng (good first issue, hướng dẫn đóng góp) — `B` · Tuần 7 · MVP
  - Hoàn thành khi: có ít nhất vài Issue gắn nhãn `good first issue`.
- [ ] **DOC-07** Quay video demo dự phòng — `C` · Tuần 8 · MVP
  - Hoàn thành khi: video chạy hết luồng, lưu ở nơi truy cập offline.
- [ ] **DOC-08** Diễn tập trình bày 15 phút ít nhất 3 lần — `ALL` · Tuần 8 · MVP
  - Hoàn thành khi: không vượt thời gian, mọi thành viên trả lời được câu hỏi kỹ thuật.

## RISK — Rủi ro cần theo dõi

- [ ] **RISK-01** Đề chính thức khác dự kiến — `A` · Tuần 4 · MVP
  - Giảm thiểu: PM-09; thiết kế dạng module.
- [ ] **RISK-02** Dùng nhầm công cụ không OSI-approved (n8n, Directus, Redpanda, Vault BSL) — `B` · Tuần 1 · MVP
  - Giảm thiểu: POF-07, rà lại ở Tuần 7.
- [ ] **RISK-03** Máy yếu không chạy nổi nhiều container — `A` · Tuần 1 · MVP
  - Giảm thiểu: compose profiles, giới hạn RAM từng dịch vụ.
- [ ] **RISK-04** Thành viên bận/thi làm trễ tiến độ — `C` · Tuần 1 · MVP
  - Giảm thiểu: người dự phòng chéo vai trò, tài liệu hóa cấu hình.
- [ ] **RISK-05** Demo lỗi vào ngày thi — `C` · Tuần 8 · MVP
  - Giảm thiểu: DOC-07 (video), dữ liệu seed, diễn tập.
