<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Kịch bản trình diễn 15 phút

Câu chuyện xuyên suốt: **một doanh nghiệp nhỏ muốn số hóa quy trình mà không phải thuê viết phần mềm**. Chạy theo thứ tự H, P, D, I để thấy từ việc hằng ngày tới quy trình, số liệu và trí tuệ nhân tạo. Slide đi kèm: [slides/index.html](slides/index.html) (mở bằng trình duyệt, phím mũi tên để chuyển, F để toàn màn hình, Ctrl+P để in ra PDF).

## Chuẩn bị (làm trước, không làm trên sân khấu)

```bash
cp .env.example .env            # điền AI_BASE_URL, AI_MODEL, AI_API_KEY nếu muốn trợ lý AI thật
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile search up -d --build
node tests/wait-ready.js
docker compose exec workflow-bridge node seed.js     # 4 quy trình, 11 hồ sơ nhiều trạng thái
# hoặc dựng lại sạch cả hệ thống trước mỗi lần diễn tập: sh scripts/demo-reset.sh
```

**Không chạy bộ kiểm thử trên máy demo**: mỗi lần chạy, `tests/` tạo thêm hàng trăm quy trình thử, kéo điểm H-P-D-I trên trang Số liệu xuống vì lẫn vào mẫu số. Máy demo dựng bằng `scripts/demo-reset.sh` cho điểm đúng (khoảng 60/100; điểm I chỉ lên khi cấu hình AI và chạy `seed.js --ai-demo`).

Danh sách kiểm tra:

- [ ] Mở sẵn bốn cửa sổ ẩn danh, mỗi cửa sổ đăng nhập một tài khoản: `staff1`, `manager1`, `director1`, `accountant1` (mật khẩu mẫu trong `infra/keycloak/realm/dxlab-realm.json`). **`manager1` và `director1` phải thiết lập OTP trước**: quét mã QR bằng điện thoại và để điện thoại cạnh bạn.
- [ ] Chuẩn bị sẵn một tệp văn bản nhỏ để đính kèm, ví dụ `bao-gia.txt` có nội dung "Báo giá máy in: 12.000.000 đồng, nhà cung cấp An Phát".
- [ ] Đợi vài phút sau khi bật để ClamAV tải xong cơ sở dữ liệu nhận dạng (`node tests/wait-ready.js` báo xong).
- [ ] Chạy thử `SEARCH_OPTIONAL=1 node --test tests/search.test.js` để chắc tìm kiếm hoạt động.
- [ ] Phương án dự phòng: video quay sẵn (issue DOC-07), bản chụp màn hình trong `docs/images/`.

## Dòng thời gian

| Phút | Nội dung | Ai | Màn hình |
|---|---|---|---|
| 0:00 | Vấn đề: phần mềm có sẵn không khớp cách làm việc, thuê riêng thì đắt, quy trình đổi thì không ai biết hệ quả | | Slide 2-3 |
| 1:30 | Đề xuất: nói ra quy trình, có ngay ứng dụng; quy trình là mã nguồn mở | | Slide 4-5 |
| 3:00 | **[P] Soạn quy trình bằng lời** | `manager1` | Soạn quy trình |
| 5:00 | **[H] Dùng ngay**: gửi hồ sơ, duyệt, ô ký | `staff1`, `manager1` | Gửi hồ sơ, Bàn làm việc |
| 8:00 | **[P] Đổi quy trình có kiểm soát** | `manager1`, `director1` | Quy trình |
| 10:00 | **[D] Số liệu thật** | `director1` | Số liệu |
| 11:30 | **[I] Hỏi đáp có kiểm quyền** và trợ lý thử việc | `staff1`, `director1` | Hỏi đáp, Trợ lý AI |
| 13:30 | Kiến trúc DX-OS, giấy phép, kiểm thử, định hướng | | Slide 9-12 |
| 14:30 | Hỏi đáp của ban giám khảo | | |

## Từng cảnh

### Cảnh 1 (3:00): soạn quy trình bằng lời, `manager1`
1. Vào **Soạn quy trình**. Gõ: *"Nhân viên xin tạm ứng, ghi số tiền và lý do. Trưởng phòng duyệt, trên 5 triệu phải thêm giám đốc, cuối cùng kế toán chi tiền."*
2. Bấm để AI phác thảo. Chỉ vào: các ô và bước tự hiện, điều kiện "Số tiền trên 5.000.000" ở bước giám đốc, câu hỏi làm rõ của AI.
3. **Nhấn mạnh:** AI chỉ đề xuất; con người xem lại rồi mới bấm **Xuất bản**. Xuất bản xong, hệ thống tự sinh BPMN, form và phân quyền.
4. Nếu AI chậm hay lỗi: chọn quy trình trong **kho mẫu** (không cần AI).

### Cảnh 2 (5:00): dùng ngay
1. `staff1`: **Gửi hồ sơ**, điền số tiền 12.000.000 và lý do, đính kèm `bao-gia.txt`, gửi.
2. `manager1`: **Bàn làm việc** hiện hồ sơ chờ. Mở hồ sơ: chỉ vào **sơ đồ quy trình** (bước đang chờ sáng lên). Duyệt, và sau vài giây sơ đồ chuyển sang bước kế tiếp. Chỉ vào **hàng ô ký** có dấu đỏ.
3. `director1` thấy hồ sơ vì trên 5 triệu: duyệt. `accountant1` thực hiện bước chi tiền.
4. Thử **từ chối không ghi lý do** ở một hồ sơ khác để cho thấy hệ thống bắt buộc phải có lý do.
5. Mở **Bảng công việc** và **Lịch** trong 20 giây để thấy cùng dữ liệu dưới dạng khác.

### Cảnh 3 (8:00): đổi quy trình như đổi mã nguồn
1. `manager1`: mở quy trình, đổi ngưỡng 5.000.000 xuống 3.000.000, **Gửi đề xuất thay đổi**.
2. Chỉ vào phần khác biệt viết bằng lời và **kết quả chạy thử trên hồ sơ cũ** (bao nhiêu hồ sơ sẽ đổi đường đi).
3. Thử chấp nhận bằng chính `manager1`: hệ thống từ chối vì người duyệt phải khác người đề xuất. Rồi `director1` chấp nhận.
4. **Nhấn mạnh:** hồ sơ đang chạy giữ phiên bản cũ; có phiên bản và nhật ký như commit.

### Cảnh 4 (10:00): số liệu
`director1` mở **Số liệu**: trước hết **Mức trưởng thành H-P-D-I** (nói: thang điểm của dự án, công thức công bố; sau buổi demo điểm P và I sẽ tăng vì vừa đổi quy trình và dùng trợ lý), rồi thời gian xử lý, **bước làm hồ sơ chờ lâu nhất**. Bấm vào một dòng để mở hồ sơ gốc. Nói: số liệu tính từ chính nhật ký ký duyệt nên không ai nhập tay.

### Cảnh 5 (11:30): trí tuệ có kiểm soát
1. `staff1` mở **Hỏi đáp tài liệu**, hỏi: *"Báo giá máy in bao nhiêu và nhà cung cấp là ai?"*. Câu trả lời dẫn số nguồn, bấm vào mở hồ sơ.
2. **Điểm then chốt:** đăng nhập `staff2` hỏi cùng câu: không thấy gì, vì `staff2` không được xem hồ sơ đó. Quyền do Hasura quyết định, không phải chỉ mục tìm kiếm.
3. `director1` mở **Trợ lý AI**: bốn nấc tự chủ, bằng chứng khớp ở từng bước, nút nâng nấc bị khóa khi chưa đủ bằng chứng. "Trợ lý phải thử việc trước khi được tin."

## Câu hỏi thường gặp của ban giám khảo

| Câu hỏi | Trả lời ngắn |
|---|---|
| AI sai thì sao? | AI chỉ đề xuất; bản mô tả sai không bao giờ xuất bản; tự duyệt chỉ ở nấc 4, chỉ duyệt, không bao giờ từ chối, và chỉ nâng khi đủ bằng chứng |
| Dữ liệu có bị gửi ra ngoài không? | Chỉ khi cấu hình dịch vụ AI ngoài; có thể chạy mô hình tại chỗ bằng Ollama |
| Giấy phép? | Apache-2.0; SPDX trong từng tệp, kiểm bằng REUSE trong CI; không thành phần AGPL |
| Kiểm thử thế nào? | `node --test tests/*.test.js`: kiểm đối chiếu đề thi và thể lệ trên hệ thống thật, xem `docs/KIEM_THU.md` |
| Điều gì chưa làm? | Nói thẳng: tìm kiếm véc-tơ, OCR, két bí mật, WAF, ẩn PII; các mục này nằm trong báo cáo kiểm thử dưới dạng `todo` |
| Cài đặt có khó không? | Ba lệnh: sao chép `.env`, `docker compose up -d --build`, nạp dữ liệu mẫu |
| Triển khai thật? | Bật TLS qua Caddy, đổi mật khẩu mẫu, sao lưu theo `docs/VAN_HANH.md` |

## Nếu có sự cố trên sân khấu

| Sự cố | Cách xử lý |
|---|---|
| Mạng chập chờn, AI không trả lời | Chuyển sang kho quy trình mẫu; nói rõ hệ thống chạy được không cần AI |
| Hồ sơ không chuyển bước | Làm mới trang, chờ vài giây (đồng bộ nền); dùng hồ sơ mẫu có sẵn |
| Mất ứng dụng OTP | Dùng video dự phòng cho phần của `manager1` và `director1` |
| Hệ thống sập | Bật video dự phòng, rồi `docker compose up -d` ở nền |
