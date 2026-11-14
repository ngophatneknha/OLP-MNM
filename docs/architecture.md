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
  GW -.-> S3[("SeaweedFS S3 (route: kế hoạch)")]
  HS -- "event trigger" --> BR["workflow-bridge"] --> FL["Flowable BPMN"]
  BR -- "ghi mã tiến trình" --> HS
  BI["Metabase (kế hoạch)"] --> PG
```

Nguyên tắc: tầng lõi **headless** – chỉ cung cấp dịch vụ qua API; mọi giao diện nằm ở tầng ứng dụng.
## Bộ sinh ứng dụng

Một ứng dụng quy trình chỉ là dữ liệu: một dòng trong bảng `app` với cột `spec`:

```json
{
  "fields": [{ "key": "so_tien", "label": "Số tiền", "type": "number", "required": true }],
  "steps": [
    { "key": "truong_phong", "name": "Trưởng phòng duyệt", "role": "manager" },
    { "key": "giam_doc", "name": "Giám đốc duyệt", "role": "director",
      "when": { "field": "so_tien", "op": ">", "value": 5000000 } },
    { "key": "chi_tien", "name": "Kế toán chi tiền", "role": "accountant", "type": "task" }
  ]
}
```

Khi `spec` được tạo hoặc sửa, `workflow-bridge` kiểm tra rồi biên dịch (`services/workflow-bridge/compile.js`):

| Từ spec | Sinh ra | Ở đâu |
|---|---|---|
| `steps`, `when` | Quy trình BPMN `app_<key>` (user task theo vai trò, cổng rẽ nhánh, nhánh từ chối) | Flowable |
| `fields` | View phẳng `bi.app_<key>` đã ép kiểu | PostgreSQL |
| `fields` | Kiểm tra kiểu / bắt buộc khi gửi hồ sơ (trigger `submission_check`) | PostgreSQL |
| `role` của bước đang chờ | Ai được thấy và hành động trên hồ sơ (`waiting_role`) | Hasura |

Mọi định danh trong spec bị ép theo mẫu `^[a-z][a-z0-9_]{1,30}$` trước khi chèn vào BPMN hay SQL; có kiểm thử cho các trường hợp chèn mã.

Trợ lý AI (`ai.js`, Hasura action `generateApp`, chỉ role `manager`) chỉ tạo ra `spec` đề xuất. Kết quả đi qua cùng bộ kiểm tra, được tự sửa một lần nếu sai, và không bao giờ tự xuất bản.

## Luồng xử lý một hồ sơ

1. Người dùng tạo `submission` qua GraphQL (Hasura tự gán `submitter_id` từ token; trigger DB kiểm dữ liệu theo spec).
2. Hasura event trigger gọi `workflow-bridge`, dịch vụ này khởi tạo tiến trình `app_<key>` trên Flowable với `businessKey` = mã hồ sơ, rồi ghi bước đang chờ (`current_step`, `waiting_role`) vào hồ sơ.
3. Người có đúng vai trò đang chờ thêm một dòng `submission_event` (`approve` / `reject` / `done`); Hasura chặn mọi người khác và mọi hồ sơ đã kết thúc.
4. Event trigger khiến `workflow-bridge` hoàn tất đúng user task đó trên Flowable, rồi đồng bộ lại bước kế tiếp hoặc kết quả cuối.

Phân quyền chỉ đặt ở một nơi (Hasura); Flowable là nguồn sự thật của quy trình; `submission_event` là nhật ký chỉ-thêm. Sự kiện được Hasura gửi lại khi lỗi nên các bước ở `workflow-bridge` đều chạy lại được an toàn.

## Xác thực

Keycloak cấp JWT; APISIX kiểm tra chữ ký tại biên (JWKS), Hasura kiểm tra lại và lấy role từ `realm_access.roles`, mã người dùng từ `sub`.
