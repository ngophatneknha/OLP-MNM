<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Hướng dẫn sử dụng

Dành cho người dùng cuối. Hệ thống chia việc thành bốn không gian; thanh bên trái có nhãn **H**, **P**, **D**, **I** cạnh từng mục để biết mục đó thuộc không gian nào. Muốn thử ngay, nạp dữ liệu mẫu (xem README) rồi đăng nhập bằng một tài khoản mẫu.

| Nhãn | Không gian | Dùng để |
|---|---|---|
| **H** | Con người | Việc của tôi, bảng công việc, lịch, tài liệu, trang cá nhân |
| **P** | Quy trình | Gửi hồ sơ, xem và đổi quy trình, soạn quy trình mới |
| **D** | Dữ liệu | Số liệu điều hành |
| **I** | Trí tuệ | Hỏi đáp tài liệu, trợ lý AI thử việc |

Mục nào hiện ra phụ thuộc vai trò của bạn (nhân viên, trưởng phòng, giám đốc, kế toán). Trang có nút đổi ngôn ngữ vi/en ở chân thanh bên; phần khung và các trang Bảng công việc, Lịch, Cá nhân, Hỏi đáp đã có tiếng Anh, các trang còn lại hiện bằng tiếng Việt.

## Đăng nhập

Vào địa chỉ ứng dụng (mặc định http://localhost:3000), nhập tài khoản và mật khẩu. **Trưởng phòng và giám đốc phải nhập thêm mã OTP** từ ứng dụng như FreeOTP hay Google Authenticator; lần đầu hệ thống hướng dẫn quét mã QR để thiết lập. Nhân viên và kế toán chỉ cần mật khẩu. Nhập sai mật khẩu nhiều lần sẽ bị khóa tạm thời.

## [H] Con người

### Bàn làm việc
Trang đầu tiên. Mục **Chờ bạn xử lý** (trưởng phòng, giám đốc, kế toán) liệt kê hồ sơ đang cần bạn kèm người gửi, thông tin chính và gợi ý của trợ lý AI nếu có; duyệt hoặc từ chối ngay tại đó. **Từ chối bắt buộc ghi lý do** để người gửi biết cần sửa gì. Mục **Hồ sơ bạn đã gửi** cho biết từng hồ sơ đang ở đâu.

### Bảng công việc
Hồ sơ xếp cột như bảng Kanban: *Chờ bạn*, *Đang chờ người khác*, *Hoàn tất*, *Bị từ chối*. Mỗi cột hiện tối đa 15 hồ sơ mới nhất; bấm vào thẻ để mở hồ sơ.

### Lịch
Lưới theo tháng, mỗi ô liệt kê hồ sơ được gửi hoặc hoàn tất trong ngày. Dùng nút mũi tên để đổi tháng.

### Tài liệu
Mọi tệp đính kèm bạn được phép xem, ở một nơi. Bạn chỉ thấy tệp của hồ sơ mà bạn gửi hoặc được giao xử lý.

### Cá nhân
Thông tin của bạn, số hồ sơ đã gửi, số việc đang chờ, và **trung tâm thông báo**: việc mới cần bạn và kết quả (duyệt, từ chối, hoàn tất) của hồ sơ bạn đã gửi. Thông báo tự cập nhật sau vài giây.

## [P] Quy trình

### Gửi hồ sơ
Chọn loại hồ sơ, điền các ô (ô có dấu * bắt buộc), đính kèm tệp nếu cần (mỗi tệp tối đa 10 MB; tệp bị phát hiện mã độc sẽ bị từ chối) rồi gửi. Trang hồ sơ hiện **sơ đồ quy trình** (bước đang chờ sáng lên, bước đã ký có dấu ✓, bước không áp dụng nét đứt có đường vòng; tự cập nhật sau vài giây khi hồ sơ chuyển bước) và **hàng ô ký**: ai đã ký có dấu đỏ kèm tên và giờ, ô đang chờ sáng lên, và nhật ký đầy đủ bên dưới. Bạn không thể tự duyệt hồ sơ của chính mình.

### Quy trình
Danh sách quy trình đang chạy, mỗi quy trình có **phiên bản** bất biến. Từ đây:
- **Góp ý hoặc báo lỗi** quy trình: ai cũng làm được.
- **Đề xuất thay đổi** (trưởng phòng): hệ thống hiển thị phần khác biệt bằng lời thường và **chạy thử trên các hồ sơ đã có**, cho biết bao nhiêu hồ sơ sẽ đổi đường đi. Người chấp nhận (giám đốc) phải khác người đề xuất. Hồ sơ cũ vẫn chạy theo phiên bản cũ.

### Soạn quy trình (trưởng phòng)
Ba cách tạo: lấy từ **kho quy trình mẫu**, tự khai báo ô và bước trên form, hoặc **gõ mô tả bằng lời** để trợ lý AI phác thảo. AI chỉ đề xuất: bạn xem lại trên form rồi mới **Xuất bản**. Mỗi bước có người xử lý (vai trò), loại (duyệt hoặc chỉ thực hiện) và điều kiện tùy chọn, ví dụ "chỉ khi Số tiền trên 5.000.000". Bản mô tả sai sẽ không bao giờ được xuất bản.

## [D] Dữ liệu

### Số liệu (trưởng phòng, giám đốc)
**Mức trưởng thành H-P-D-I** (điểm 0 đến 100 cho từng không gian, và điểm chung); bao nhiêu hồ sơ đang chờ, hoàn tất, bị từ chối; thời gian xử lý trung bình; **bước nào làm hồ sơ chờ lâu nhất**; hồ sơ đang chờ lâu. Mọi con số tính từ chính hồ sơ và nhật ký ký duyệt, dòng nào cũng bấm vào được hồ sơ gốc. Trang tự làm mới.

**Cách tính mức trưởng thành** (thang điểm của dự án, không phải chuẩn công nghiệp; dưới 5 hồ sơ thì hiện "chưa đủ dữ liệu", không bịa số):

| Không gian | Thành phần (trọng số) |
|---|---|
| H, Con người | hồ sơ không chờ quá 48 giờ ở mỗi bước (50%); mọi vai trò mà quy trình cần đều đã tham gia (50%) |
| P, Quy trình | quy trình có từ 2 phiên bản (40%); đề xuất thay đổi đã được xử lý (40%); hồ sơ đang chạy đúng phiên bản mới nhất (20%) |
| D, Dữ liệu | hồ sơ xong có nhật ký đủ mọi bước áp dụng (60%); quy trình có từ 5 hồ sơ trở lên (40%) |
| I, Trí tuệ | bước đã có ý kiến của trợ lý AI (50%); bước đã nâng nấc tự chủ (50%) |

Thành phần chưa có dữ liệu thì bỏ ra khỏi trung bình. Mức: dưới 40 "Khởi đầu", từ 40 "Đang phát triển", từ 70 "Trưởng thành". Công thức nằm ở `web/src/maturity.js`, có kiểm thử.

## [I] Trí tuệ

### Hỏi đáp tài liệu
Gõ câu hỏi bằng lời thường. Trợ lý tìm trong hồ sơ và các tệp văn bản bạn **được phép xem**, trả lời ngắn gọn và **ghi số nguồn** cho từng ý; bấm vào nguồn để mở hồ sơ gốc. Nếu không có tài liệu nào liên quan, nó nói thẳng thay vì đoán. (Cần bật thành phần tìm kiếm, xem [TRI_TUE.md](TRI_TUE.md).)

### Trợ lý AI thử việc (trưởng phòng, giám đốc)
Ở mỗi bước duyệt, trợ lý đi qua bốn nấc: *Người làm*, *Chạy bóng* (âm thầm cho ý kiến để so với quyết định của người), *Gợi ý* (người duyệt thấy gợi ý kèm lý do), *Tự duyệt* (chỉ duyệt hồ sơ hợp lệ, **không bao giờ tự từ chối**). Chỉ giám đốc nâng nấc, từng nấc một, và chỉ khi có ít nhất 10 quyết định thật của người với từ 90% khớp. Trưởng phòng và giám đốc hạ nấc được bất cứ lúc nào.

## Gặp sự cố?

| Hiện tượng | Cách xử lý |
|---|---|
| Không vào được trang | Xem phần "Sự cố thường gặp" trong [KY_THUAT.md](KY_THUAT.md) |
| Đăng nhập bị khóa tạm thời | Chờ vài phút rồi thử lại |
| Trưởng phòng, giám đốc mất ứng dụng OTP | Quản trị viên đặt lại OTP trong Keycloak |
| Tệp tải lên bị từ chối | Tệp lớn hơn 10 MB, rỗng, hoặc bị phát hiện mã độc |
| Hồ sơ không thấy ở bước kế tiếp | Hệ thống đồng bộ trong vài giây; làm mới trang |
