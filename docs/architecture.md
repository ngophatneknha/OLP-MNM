<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Kiến trúc

```mermaid
flowchart TB
  UI["Ứng dụng Nuxt 3 (H-P-D-I)"] --> GW["APISIX Gateway"]
  GW --> KC["Keycloak SSO"]
  GW --> HS["Hasura GraphQL"] --> PG[("PostgreSQL")]
  GW --> MIN[("MinIO")]
  GW -.-> FL["Flowable (kế hoạch)"]
  BI["Metabase (kế hoạch)"] --> PG
```

Nguyên tắc: tầng lõi **headless** – chỉ cung cấp dịch vụ qua API; mọi giao diện nằm ở tầng ứng dụng.
Kế hoạch chi tiết và các quyết định công nghệ sẽ được cập nhật tại đây.
