<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# DX-Lab Project Hub (DX-OS Open-Core)

[![CI](https://github.com/ngophatneknha/OLP-MNM/actions/workflows/ci.yml/badge.svg)](https://github.com/ngophatneknha/OLP-MNM/actions/workflows/ci.yml)
[![License](https://img.shields.io/badge/License-Apache_2.0-blue.svg)](LICENSE)

Sản phẩm dự thi **OLP Phần mềm nguồn mở 2026** – chủ đề *Xây dựng Hệ điều hành Doanh nghiệp số (DX-OS)*.

> Trạng thái: **khung dự án (v0.0.1 – chưa phát hành)**. Xem [CHANGELOG.md](CHANGELOG.md).

## Ý tưởng

Doanh nghiệp nhỏ thất bại khi chuyển đổi số không phải vì thiếu phần mềm, mà vì phần mềm có sẵn không khớp cách họ đang làm việc, còn thuê viết riêng thì quá đắt. DX-Lab Project Hub lấp khoảng trống đó: **mô tả quy trình bằng lời, nhận lại một ứng dụng chạy được**.

1. Quản lý mô tả quy trình bằng tiếng Việt (hoặc tự khai báo các trường và các bước).
2. Trợ lý AI đề xuất bản mô tả ứng dụng và hỏi lại những điểm còn mơ hồ; con người xem lại và quyết định.
3. Hệ thống biên dịch bản mô tả thành quy trình BPMN, phân quyền theo vai trò, rào chắn dữ liệu và view cho dashboard.
4. Nhân viên gửi hồ sơ; từng vai trò chỉ thấy và xử lý đúng bước của mình; mọi hành động được ghi nhật ký.

Tắt AI thì hệ thống vẫn chạy đầy đủ: AI chỉ đề xuất, không tự xuất bản.

## Kiến trúc

- **Tầng 1 – Lõi headless (không UI người dùng cuối):** Keycloak (SSO), Apache APISIX (API Gateway), PostgreSQL + Hasura (API dữ liệu), SeaweedFS (lưu trữ đối tượng chuẩn S3), Flowable (workflow BPMN).
- **Tầng 2 – Ứng dụng H-P-D-I:** ứng dụng Nuxt 3 (sẽ bổ sung) + dashboard Metabase (sẽ bổ sung).

Chi tiết: [docs/architecture.md](docs/architecture.md).

## Chạy thử (từ mã nguồn)

Yêu cầu: Docker + Docker Compose v2.

```bash
git clone <URL-kho-ma-nguon>
cd <thu-muc>
cp .env.example .env        # sửa mật khẩu nếu cần
docker compose up -d
```

| Dịch vụ | Địa chỉ | Ghi chú |
|---|---|---|
| API Gateway (APISIX) | http://localhost:9080 | Cổng vào duy nhất cho ứng dụng |
| Keycloak | http://localhost:8081 | Quản trị: tài khoản trong `.env` |
| Hasura | http://localhost:8082 | Chỉ dùng nội bộ/phát triển |
| Flowable REST | http://localhost:8083/flowable-rest | Chỉ dùng nội bộ/phát triển; tài khoản trong `.env` |

Tài khoản mẫu (realm `dxlab`, chỉ dùng cho phát triển): `staff1`, `staff2`, `manager1`, `director1`, `accountant1` – mật khẩu xem trong `infra/keycloak/realm/dxlab-realm.json`.

Kiểm tra nhanh toàn bộ chuỗi (đăng nhập → gateway → định nghĩa ứng dụng → chạy quy trình → phân quyền): `sh scripts/smoke.sh`.

### Trợ lý AI (tùy chọn)

Đặt `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` trong `.env` (xem `.env.example`) rồi `docker compose up -d`. Để giữ dữ liệu trong nội bộ, hãy trỏ tới Ollama/vLLM chạy trên máy của bạn; nếu trỏ tới dịch vụ ngoài thì nội dung mô tả quy trình sẽ được gửi tới dịch vụ đó. Để trống thì tính năng AI tắt, phần còn lại không đổi.

Lần khởi động đầu mất khoảng 1–2 phút (Keycloak nhập realm, Flowable tạo bảng). Cần khoảng 4 GB RAM cho Docker.

Dừng và xóa dữ liệu: `docker compose down -v`.

## Kế hoạch & tiến độ

Danh sách đầu việc chi tiết (85 mục, chia theo nhóm, người phụ trách, tuần, ưu tiên MVP/Stretch) và bảng tiến độ: [docs/BACKLOG.md](docs/BACKLOG.md). Trạng thái theo dõi trên tab **Issues** / **Projects**.

## Giấy phép

Mã nguồn tự viết phát hành theo [Apache License 2.0](LICENSE). Mỗi tệp mã chứa tiêu đề SPDX; kiểm tra bằng `reuse lint`. Danh sách thành phần bên thứ ba: [THIRD_PARTY.md](THIRD_PARTY.md).

## Đóng góp & báo lỗi

Xem [CONTRIBUTING.md](CONTRIBUTING.md). Lỗi và đề xuất được theo dõi tại mục **Issues** của kho mã nguồn.
