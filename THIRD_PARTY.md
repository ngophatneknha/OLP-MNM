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
| curl (image `curlimages/curl`, nạp metadata Hasura, triển khai BPMN) | 8.10.1 | curl License (MIT-like) | ☐ |
| Apache APISIX | 3.9.1 | Apache-2.0 | ☐ |

Dự kiến bổ sung: Metabase, Nuxt/Vue, Meilisearch, Ollama, Qdrant.

Không dùng (không phải giấy phép OSI-approved): n8n, Directus, Redpanda, HashiCorp Vault phiên bản BSL.
