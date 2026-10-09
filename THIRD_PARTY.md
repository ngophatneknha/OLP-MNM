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
| MinIO | latest → **cần cố định phiên bản** | AGPL-3.0 | ☐ |
| Apache APISIX | 3.9.1 | Apache-2.0 | ☐ |

Dự kiến bổ sung: Flowable, Metabase, Nuxt/Vue, Meilisearch, Ollama, Qdrant.

Không dùng (không phải giấy phép OSI-approved): n8n, Directus, Redpanda, HashiCorp Vault phiên bản BSL.
