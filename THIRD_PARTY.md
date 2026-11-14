<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Thành phần bên thứ ba

Các thành phần chạy dưới dạng **container độc lập, không sửa mã nguồn, không đính kèm mã vào kho này**; chỉ tham chiếu image chính thức.

> ⚠ Giấy phép ghi dưới đây là **dự kiến**, cần đối chiếu lại trên kho chính thức của từng dự án và phiên bản đang dùng trước khi phát hành v1.0.0.

| Thành phần | Phiên bản (compose) | Giấy phép dự kiến | Đã xác minh |
|---|---|---|---|
| PostgreSQL | 16 | PostgreSQL License | ☐ |
| Keycloak | 26.0 | Apache-2.0 | ☐ |
| Hasura GraphQL Engine (Community) | v2.40.0 | Apache-2.0 (lõi CE) | ☐ |
| SeaweedFS | 4.53 | Apache-2.0 | ☐ |
| Flowable REST | 7.2.0 | Apache-2.0 | ☐ |
| Node.js (image `node`, chạy `workflow-bridge`) | 22.19.0 | MIT | ☐ |
| curl (image `curlimages/curl`, nạp metadata Hasura) | 8.10.1 | curl License (MIT-like) | ☐ |
| Apache APISIX | 3.9.1 | Apache-2.0 | ☐ |

Dự kiến bổ sung: Metabase, Nuxt/Vue, Meilisearch, Ollama, Qdrant.

### Thư viện của ứng dụng web

Cài bằng `npm ci` theo `web/package-lock.json` khi build; không sao chép mã vào kho này.

| Thư viện | Phiên bản | Giấy phép dự kiến | Đã xác minh |
|---|---|---|---|
| Vue | 3.5 | MIT | ☐ |
| Vue Router | 5.5 | MIT | ☐ |
| keycloak-js | 26.2 | Apache-2.0 | ☐ |
| Vite, @vitejs/plugin-vue (công cụ build) | 8.3 / 6.0 | MIT | ☐ |
| Tailwind CSS (công cụ build) | 4.3 | MIT | ☐ |
| Lucide (biểu tượng, `lucide-vue-next`) | 1.0 | ISC | ☐ |
| Be Vietnam Pro (phông chữ, `@fontsource`) | 5.3 | OFL-1.1 | ☐ |
| Noto Serif (phông chữ, `@fontsource`) | 5.3 | OFL-1.1 | ☐ |
| nginx (image phục vụ tệp tĩnh) | 1.28.0 | BSD-2-Clause | ☐ |

Trợ lý AI là **tùy chọn** và không đính kèm mô hình hay thư viện nào: hệ thống chỉ gọi một địa chỉ HTTP tương thích OpenAI do người triển khai cấu hình (khuyến nghị Ollama – MIT – với mô hình trọng số mở chạy nội bộ).

Không dùng (không phải giấy phép OSI-approved): n8n, Directus, Redpanda, HashiCorp Vault phiên bản BSL.
