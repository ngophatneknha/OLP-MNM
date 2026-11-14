<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Kiến trúc

```mermaid
flowchart TB
  UI["Ứng dụng web Vue 3 (H-P-D-I)"] -- "token Keycloak" --> GW["APISIX Gateway<br/>kiểm JWT, CORS, giới hạn tần suất"]
  UI -. đăng nhập .-> KC["Keycloak SSO"]
  GW -- "/v1/graphql" --> HS["Hasura GraphQL<br/>phân quyền theo dòng"] --> PG[("PostgreSQL")]
  GW -- "/files" --> BR["workflow-bridge"]
  HS -- "event trigger, action" --> BR
  BR --> FL["Flowable BPMN"]
  BR -- "ghi bước đang chờ" --> HS
  BR -- "tệp đính kèm" --> S3[("SeaweedFS S3<br/>không mở ra ngoài")]
```

Nguyên tắc: tầng lõi **headless** – chỉ cung cấp dịch vụ qua API; mọi giao diện nằm ở tầng ứng dụng.

## Các không gian trong ứng dụng

| Không gian | Màn hình | Dữ liệu |
|---|---|---|
| [H] Con người | Bàn làm việc, Tài liệu (mọi tệp tôi được xem) | `submission`, `attachment` |
| [P] Quy trình | Gửi hồ sơ, trang hồ sơ (ô ký, nhật ký), Quy trình (phiên bản, đề xuất, góp ý), Soạn quy trình | `app`, `app_version`, `app_change`, `app_issue`, `submission_event` |
| [D] Dữ liệu | Số liệu: thời gian xử lý, điểm nghẽn, trạng thái, theo loại hồ sơ | tính từ `submission` và `submission_event` (`web/src/metrics.js`, có kiểm thử) |
| [I] Trí tuệ | Trợ lý phác thảo quy trình trong Soạn quy trình | Hasura action `generateApp` |

## Tệp đính kèm

Nội dung tệp nằm trong kho S3 (SeaweedFS); bảng `attachment` giữ tên, kích thước và khóa đối tượng. Tệp đi qua `POST /files` và `GET /files/<id>` của cổng API:

1. Cổng API kiểm chữ ký token (JWKS của Keycloak).
2. `workflow-bridge` gọi Hasura **bằng chính token của người dùng**; quyền xem/đính kèm do cùng bộ luật phân quyền của hồ sơ quyết định, nên không có hai nơi định nghĩa "ai được thấy tệp".
3. Dòng dữ liệu được ghi trước, rồi mới ghi tệp vào S3; nếu ghi S3 lỗi thì dòng bị xóa để không có bản ghi trỏ vào tệp không tồn tại.
4. Tải về luôn là `attachment` kèm `nosniff`: tệp do người dùng gửi không bao giờ được trình duyệt mở như trang web.

Giới hạn hiện tại: mỗi tệp tối đa 10 MB, chưa quét mã độc (backlog ID-09).

## Bảo mật khi triển khai

- Chỉ ba cổng mở ra máy chủ: ứng dụng web, cổng API, trang đăng nhập Keycloak. Cơ sở dữ liệu, Hasura, Flowable, kho S3 chỉ nằm trong mạng nội bộ.
- Console Hasura tắt; Keycloak chạy chế độ production (`start`).
- Ứng dụng web chỉ đăng nhập bằng luồng chuyển hướng có PKCE. Đăng nhập bằng mật khẩu trực tiếp chỉ bật cho client `dxlab-cli` (smoke test và nạp dữ liệu mẫu); smoke test kiểm tra điều này.
- Chưa có: TLS (đặt reverse proxy phía trước), xác thực hai yếu tố, quét mã độc, đổi mật khẩu tài khoản mẫu. Đây là việc phải làm trước khi đưa lên Internet.

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

## Quy trình là mã nguồn mở

Cách dự án nguồn mở quản lý mã được áp dụng cho quy trình của tổ chức:

| Trong dự án nguồn mở | Trong DX-Lab | Ở đâu |
|---|---|---|
| Commit / release | Phiên bản quy trình bất biến, có ghi chú | bảng `app_version` |
| Pull request | Đề xuất thay đổi | bảng `app_change` |
| CI kiểm tra PR | Kiểm tra hợp lệ + chạy thử trên hồ sơ cũ (`simulate` trong `compile.js`), ghi vào `app_change.checks` | `workflow-bridge` |
| Review bắt buộc | Người duyệt phải khác người đề xuất; thiếu kết quả kiểm tra thì không chấp nhận được | quyền Hasura + trigger `app_change_decide` |
| Issue | Góp ý / báo lỗi quy trình | bảng `app_issue` |
| Fork | Lấy quy trình từ `library/` làm điểm xuất phát; xuất JSON để đóng góp lại | Hasura action `library` |

Chấp nhận một đề xuất chạy trong một giao dịch cơ sở dữ liệu: cập nhật `app`, thêm `app_version`, rồi `workflow-bridge` triển khai định nghĩa mới lên Flowable. Hồ sơ đang chạy tiếp tục theo phiên bản cũ; mỗi hồ sơ lưu `app_version` lúc gửi nên luôn hiển thị đúng sơ đồ của nó.

## Luồng xử lý một hồ sơ

1. Người dùng tạo `submission` qua GraphQL (Hasura tự gán `submitter_id` từ token; trigger DB kiểm dữ liệu theo spec).
2. Hasura event trigger gọi `workflow-bridge`, dịch vụ này khởi tạo tiến trình `app_<key>` trên Flowable với `businessKey` = mã hồ sơ, rồi ghi bước đang chờ (`current_step`, `waiting_role`) vào hồ sơ.
3. Người có đúng vai trò đang chờ thêm một dòng `submission_event` (`approve` / `reject` / `done`); Hasura chặn mọi người khác và mọi hồ sơ đã kết thúc.
4. Event trigger khiến `workflow-bridge` hoàn tất đúng user task đó trên Flowable, rồi đồng bộ lại bước kế tiếp hoặc kết quả cuối.

Phân quyền chỉ đặt ở một nơi (Hasura); Flowable là nguồn sự thật của quy trình; `submission_event` là nhật ký chỉ-thêm. Sự kiện được Hasura gửi lại khi lỗi nên các bước ở `workflow-bridge` đều chạy lại được an toàn.

## Xác thực

Keycloak cấp JWT; APISIX kiểm tra chữ ký tại biên (JWKS), Hasura kiểm tra lại và lấy role từ `realm_access.roles`, mã người dùng từ `sub`.
