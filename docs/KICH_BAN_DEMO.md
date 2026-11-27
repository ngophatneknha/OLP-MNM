<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Kịch bản trình diễn 15 phút

Đề quy định bốn nội dung cho 15 phút: **(1) giải pháp thiết kế và lựa chọn công nghệ, (2) tính năng của nền tảng và bài toán ứng dụng minh họa, (3) kết quả sản phẩm và demo, (4) định hướng phát triển**. Kịch bản bám đúng bốn mục đó. Câu chuyện xuyên suốt: **Tầng 1 là nền tảng lõi chạy ngầm bằng công nghệ nguồn mở; Tầng 2 là một ứng dụng chạy trên nó, giúp doanh nghiệp nhỏ số hóa quy trình mà không phải thuê viết phần mềm**. Slide đi kèm: [slides/index.html](slides/index.html) (mở bằng trình duyệt, phím mũi tên để chuyển, F để toàn màn hình, Ctrl+P để in ra PDF).

## Chuẩn bị (làm trước, không làm trên sân khấu)

```bash
cp .env.example .env            # điền AI_BASE_URL, AI_MODEL, AI_API_KEY nếu muốn trợ lý AI thật
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile search up -d --build
node tests/wait-ready.js
docker compose exec workflow-bridge node seed.js     # 4 quy trình, 11 hồ sơ nhiều trạng thái
# hoặc dựng lại sạch cả hệ thống trước mỗi lần diễn tập: sh scripts/demo-reset.sh
node scripts/demo-platform.mjs                       # chạy thử một lần để chắc phần demo nền tảng ổn (rồi dựng lại sạch)
```

**Không chạy bộ kiểm thử trên máy demo**: mỗi lần chạy, `tests/` tạo thêm hàng trăm quy trình thử, kéo điểm H-P-D-I trên trang Số liệu xuống vì lẫn vào mẫu số. Máy demo dựng bằng `scripts/demo-reset.sh` cho điểm đúng (khoảng 60/100; điểm I chỉ lên khi cấu hình AI và chạy `seed.js --ai-demo`). Chạy `scripts/demo-platform.mjs` nhiều lần cũng thêm quy trình và hồ sơ thử, nên chạy thật đúng một lần trên sân khấu.

Danh sách kiểm tra:

- [ ] Mở sẵn bốn cửa sổ ẩn danh, mỗi cửa sổ đăng nhập một tài khoản: `staff1`, `manager1`, `director1`, `accountant1` (mật khẩu mẫu trong `infra/keycloak/realm/dxlab-realm.json`). **`manager1` và `director1` phải thiết lập OTP trước**: quét mã QR bằng điện thoại và để điện thoại cạnh bạn.
- [ ] Mở sẵn một cửa sổ dòng lệnh ở thư mục dự án, phóng to chữ để ban giám khảo đọc được.
- [ ] Chuẩn bị sẵn một tệp văn bản nhỏ để đính kèm, ví dụ `bao-gia.txt` có nội dung "Báo giá máy in: 12.000.000 đồng, nhà cung cấp An Phát".
- [ ] Đợi vài phút sau khi bật để ClamAV tải xong cơ sở dữ liệu nhận dạng (`node tests/wait-ready.js` báo xong).
- [ ] Chạy thử `SEARCH_OPTIONAL=1 node --test tests/search.test.js` để chắc tìm kiếm hoạt động.
- [ ] Phương án dự phòng: video quay sẵn (issue DOC-07), bản chụp màn hình trong `docs/images/`.

## Dòng thời gian

| Phút | Nội dung | Màn hình |
|---|---|---|
| 0:00 | **Mục 1: giải pháp thiết kế và công nghệ.** Bài toán ốc đảo dữ liệu và "con tin" nhà cung cấp; tháp ba tầng; mỗi yêu cầu của Đề một thành phần nguồn mở | Slide 1-4 |
| 3:00 | **Mục 2: tính năng nền tảng và bài toán minh họa.** Tầng 1 cung cấp gì; bốn nguyên lý của Đề, mỗi cái một bằng chứng; bài toán "nói ra quy trình, có ngay ứng dụng"; quy trình là mã nguồn mở | Slide 5-8 |
| 6:00 | **Mục 3a: demo nền tảng** bằng `node scripts/demo-platform.mjs` | Slide 9, dòng lệnh |
| 8:00 | **Mục 3b: demo ứng dụng** [P] soạn quy trình, [H] dùng ngay, [P] đổi quy trình có kiểm soát | Giao diện web |
| 11:30 | [D] số liệu, [I] hỏi đáp có kiểm quyền và trợ lý thử việc | Giao diện web |
| 13:00 | Kết quả kiểm thử và mã nguồn mở đúng nghĩa | Slide 14 |
| 13:30 | **Mục 4: định hướng**, nói thẳng điều chưa làm | Slide 15 |
| 14:30 | Hỏi đáp của ban giám khảo | |

Nếu thiếu giờ, bỏ cảnh 3 (đổi quy trình) và đọc lướt cảnh 5; **không bỏ** mục 1, mục 2 và demo nền tảng vì đó là những gì Đề yêu cầu.

## Từng cảnh

### Cảnh 0 (6:00): demo nền tảng trên dòng lệnh
Chạy `node scripts/demo-platform.mjs` và đọc to từng bước khi nó hiện ra (khoảng 3 phút):
1. **Cảm biến (nguyên lý ii):** số đo 5 °C chỉ được ghi; số đo 12 °C vượt ngưỡng 8 nên hệ thống **tự mở một hồ sơ sửa chữa** đi qua quy trình duyệt của người. Gửi không có token thiết bị bị chặn 401.
2. **Kho lạnh (nguyên lý i):** hồ sơ đã kết thúc được xuất ra kho S3, rồi **kiểm chứng sổ cái**: chuỗi băm liền mạch, mọi tệp còn nguyên. Nói: sổ cái không sửa xóa được ngay ở cơ sở dữ liệu.
3. **Phả hệ (nguyên lý iii):** báo cáo nào đọc từ bảng nào, lấy tự động từ danh mục PostgreSQL.
4. **Đa tổ chức:** tổ chức B không thấy quy trình, hồ sơ hay kho lạnh của tổ chức mặc định.
5. **Zero-Trust (nguyên lý iv):** không token và token giả đều bị cổng API chặn 401 trước khi tới dữ liệu.
6. **Chữ ký số:** trưởng phòng duyệt hồ sơ sửa chữa; hành động có chữ ký X.509 do CA của tổ chức cấp, kiểm chứng hợp lệ. Nói thẳng: PKI phần mềm, chưa HSM và chưa có giá trị pháp lý theo luật.
7. **Không gian dữ liệu:** chính cảm biến đó đọc được theo chuẩn NGSI-LD kèm vị trí; web có mục "Bản đồ cảm biến" dùng cùng điểm cuối.

Nếu được hỏi về tự phục hồi: `docker compose kill hasura` rồi chỉ cho thấy dịch vụ tự khởi động lại (có kiểm thử OPS và `tests/recovery.test.js`).

### Cảnh 1 (8:00): soạn quy trình bằng lời, `manager1`
1. Vào **Soạn quy trình**. Gõ: *"Nhân viên xin tạm ứng, ghi số tiền và lý do. Trưởng phòng duyệt, trên 5 triệu phải thêm giám đốc, cuối cùng kế toán chi tiền."*
2. Bấm để AI phác thảo. Chỉ vào: các ô và bước tự hiện, điều kiện "Số tiền trên 5.000.000" ở bước giám đốc, câu hỏi làm rõ của AI.
3. **Nhấn mạnh:** AI chỉ đề xuất; con người xem lại rồi mới bấm **Xuất bản**. Xuất bản xong, hệ thống tự sinh BPMN, form và phân quyền.
4. Nếu AI chậm hay lỗi: chọn quy trình trong **kho mẫu** (không cần AI).

### Cảnh 2 (9:30): dùng ngay
1. `staff1`: **Gửi hồ sơ**, điền số tiền 12.000.000 và lý do, đính kèm `bao-gia.txt`, gửi.
2. `manager1`: **Bàn làm việc** hiện hồ sơ chờ (tự cập nhật, không cần tải lại). Mở hồ sơ: chỉ vào **sơ đồ quy trình** (bước đang chờ sáng lên). Duyệt, và sơ đồ chuyển sang bước kế tiếp. Chỉ vào **hàng ô ký** có dấu đỏ.
3. `director1` thấy hồ sơ vì trên 5 triệu: duyệt. `accountant1` thực hiện bước chi tiền.
4. Thử **từ chối không ghi lý do** ở một hồ sơ khác để cho thấy hệ thống bắt buộc phải có lý do.
5. Mở **Bảng công việc** và **Lịch** trong 20 giây để thấy cùng dữ liệu dưới dạng khác.

### Cảnh 3 (10:30): đổi quy trình như đổi mã nguồn
1. `manager1`: mở quy trình, đổi ngưỡng 5.000.000 xuống 3.000.000, **Gửi đề xuất thay đổi**.
2. Chỉ vào phần khác biệt viết bằng lời và **kết quả chạy thử trên hồ sơ cũ** (bao nhiêu hồ sơ sẽ đổi đường đi).
3. Thử chấp nhận bằng chính `manager1`: hệ thống từ chối vì người duyệt phải khác người đề xuất. Rồi `director1` chấp nhận.
4. **Nhấn mạnh:** hồ sơ đang chạy giữ phiên bản cũ; có phiên bản và nhật ký như commit.

### Cảnh 4 (11:30): số liệu
`director1` mở **Số liệu**: trước hết **Mức trưởng thành H-P-D-I** (nói: thang điểm của dự án, công thức công bố; sau buổi demo điểm P và I sẽ tăng vì vừa đổi quy trình và dùng trợ lý), rồi thời gian xử lý, **bước làm hồ sơ chờ lâu nhất**. Bấm vào một dòng để mở hồ sơ gốc. Nói: số liệu tính từ chính nhật ký ký duyệt nên không ai nhập tay.

### Cảnh 5 (12:15): trí tuệ có kiểm soát
1. `staff1` mở **Hỏi đáp tài liệu**, hỏi: *"Báo giá máy in bao nhiêu và nhà cung cấp là ai?"*. Câu trả lời dẫn số nguồn, bấm vào mở hồ sơ.
2. **Điểm then chốt:** đăng nhập `staff2` hỏi cùng câu: không thấy gì, vì `staff2` không được xem hồ sơ đó. Quyền do Hasura quyết định, không phải chỉ mục tìm kiếm.
3. `director1` mở **Trợ lý AI**: bốn nấc tự chủ, bằng chứng khớp ở từng bước, nút nâng nấc bị khóa khi chưa đủ bằng chứng. "Trợ lý phải thử việc trước khi được tin."

## Câu hỏi thường gặp của ban giám khảo

| Câu hỏi | Trả lời ngắn |
|---|---|
| AI sai thì sao? | AI chỉ đề xuất; bản mô tả sai không bao giờ xuất bản; tự duyệt chỉ ở nấc 4, chỉ duyệt, không bao giờ từ chối, và chỉ nâng khi đủ bằng chứng |
| Dữ liệu có bị gửi ra ngoài không? | Chỉ khi cấu hình dịch vụ AI ngoài, và thông tin cá nhân (email, số điện thoại, CCCD, số thẻ) đã bị thay bằng nhãn; có thể chạy mô hình tại chỗ bằng Ollama |
| Giấy phép? | Apache-2.0; SPDX trong từng tệp, kiểm bằng REUSE trong CI; không thành phần AGPL; thành phần bên thứ ba là container riêng, không sửa |
| Kiểm thử thế nào? | `node --test tests/*.test.js`: kiểm đối chiếu đề thi và thể lệ trên hệ thống thật, xem `docs/KIEM_THU.md` |
| Điều gì chưa làm? | Nói thẳng: HSM và thu hồi chứng thư (PKI mới ở mức phần mềm), WebSocket, MQTT, GitOps nhiều máy (ArgoCD/Flux); lakehouse Iceberg, NGSI-LD ghi và thuê bao, nhật ký tập trung, trục sự kiện NATS đã có ở mức một máy; nằm trong báo cáo kiểm thử dưới dạng `todo` hoặc mục giới hạn |
| Đa tổ chức làm thế nào? | `org_id` trong token Keycloak, Hasura thêm điều kiện tổ chức vào mọi quyền, trigger gắn tổ chức cho hồ sơ; kho lạnh và cảm biến theo tổ chức; có 11 ca kiểm thử |
| Chữ ký phê duyệt có giá trị pháp lý không? | Chưa theo luật: mỗi duyệt được ký bằng chứng thư X.509 do CA của tổ chức cấp (PKI phần mềm, kiểm chứng được trên trang hồ sơ), nhưng chưa có HSM, CRL/OCSP và chưa dùng CA được cấp phép |
| Cài đặt có khó không? | Ba lệnh: sao chép `.env`, `docker compose up -d --build`, nạp dữ liệu mẫu |
| Triển khai thật? | Bật TLS qua Caddy, đổi mật khẩu mẫu, két bí mật OpenBao, sao lưu theo `docs/VAN_HANH.md` |

## Nếu có sự cố trên sân khấu

| Sự cố | Cách xử lý |
|---|---|
| Mạng chập chờn, AI không trả lời | Chuyển sang kho quy trình mẫu; nói rõ hệ thống chạy được không cần AI |
| Hồ sơ không chuyển bước | Làm mới trang, chờ vài giây (đồng bộ nền); dùng hồ sơ mẫu có sẵn |
| `demo-platform.mjs` báo lỗi đăng nhập | Hệ thống chưa nạp dữ liệu mẫu hay Keycloak chưa sẵn sàng: `node tests/wait-ready.js`, rồi chạy lại |
| Mất ứng dụng OTP | Dùng video dự phòng cho phần của `manager1` và `director1` |
| Hệ thống sập | Bật video dự phòng, rồi `docker compose up -d` ở nền |
