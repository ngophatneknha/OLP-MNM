<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# DX-Lab Project Hub (DX-OS Open-Core)

Sản phẩm dự thi **OLP Phần mềm nguồn mở 2026** – chủ đề *Xây dựng Hệ điều hành Doanh nghiệp số (DX-OS)*.

> Trạng thái: **khung dự án (v0.0.1 – chưa phát hành)**. Xem [CHANGELOG.md](CHANGELOG.md).

## Kiến trúc

- **Tầng 1 – Lõi headless (không UI người dùng cuối):** Keycloak (SSO), Apache APISIX (API Gateway), PostgreSQL + Hasura (API dữ liệu), MinIO (lưu trữ đối tượng), Flowable (workflow BPMN – sẽ bổ sung).
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
| MinIO console | http://localhost:9001 | Tài khoản trong `.env` |

Dừng và xóa dữ liệu: `docker compose down -v`.

## Giấy phép

Mã nguồn tự viết phát hành theo [Apache License 2.0](LICENSE). Mỗi tệp mã chứa tiêu đề SPDX; kiểm tra bằng `reuse lint`. Danh sách thành phần bên thứ ba: [THIRD_PARTY.md](THIRD_PARTY.md).

## Đóng góp & báo lỗi

Xem [CONTRIBUTING.md](CONTRIBUTING.md). Lỗi và đề xuất được theo dõi tại mục **Issues** của kho mã nguồn.
