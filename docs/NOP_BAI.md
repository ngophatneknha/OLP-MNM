<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Hướng dẫn nộp bài và danh sách kiểm tra trước hạn

Tài liệu cho người nộp bài. Phần việc của máy (mã, kiểm thử, bản phát hành) đã xong và nằm trong kho; phần dưới đây là việc của người.

## 1. Trước khi gửi (làm một lần, theo thứ tự)

- [ ] **Hỏi Ban tổ chức năm của hạn nộp.** Đề ghi 17:00 ngày 06/12 nhưng in năm 2025 trong khi cuộc thi là 2026; xác nhận bằng văn bản (thư hoặc tin nhắn) và giữ lại.
- [ ] Mở [trang bản phát hành](https://github.com/ngophatneknha/OLP-MNM/releases/latest): có đúng một tệp `.tar.gz`, phiên bản khớp dòng đầu của [CHANGELOG](../CHANGELOG.md).
- [ ] Mở tab Actions: lần chạy gần nhất của nhánh `main` xanh cả hai việc (kiểm thử trên hệ thống thật, kiểm giấy phép REUSE).
- [ ] Tải `.tar.gz` về một thư mục trống, giải nén, làm đúng mục "Cài đặt và chạy thử trong 5 phút" của README trên máy sạch (Docker Desktop, 8 GB RAM). Ghi lại thời gian và mọi chỗ vấp.
- [ ] Chạy `node scripts/demo-platform.mjs`: bảy bước đều có dấu ✔.
- [ ] Trên máy trình diễn, đăng nhập `manager1` và `director1` một lần để cài OTP (bắt buộc cho hai vai trò này); không chạy bộ kiểm thử trên máy này.
- [ ] Xem lại [kịch bản demo](KICH_BAN_DEMO.md), tập ít nhất hai lần, đo giờ (15 phút). Quay video dự phòng.
- [ ] Điền khóa AI thật vào `.env` nếu muốn demo soạn quy trình bằng AI; không có khóa thì dùng kho mẫu.

## 2. Thư nộp bài

Gửi từ hộp thư của đội tới địa chỉ Ban tổ chức nêu trong Thể lệ, trước hạn đã xác nhận. Tiêu đề và nội dung theo mẫu Thể lệ: tên đội, trường, danh sách thành viên (họ tên, năm sinh, ngành), người hướng dẫn, đường dẫn kho mã nguồn và bản phát hành, lời cam kết bản quyền theo phần mềm tự do nguồn mở.

- Kho mã nguồn: https://github.com/ngophatneknha/OLP-MNM
- Bản phát hành dự thi: https://github.com/ngophatneknha/OLP-MNM/releases/latest
- Không đính kèm mã hay tệp lớn; chỉ gửi đường dẫn. Kho phải công khai (kiểm bằng cửa sổ ẩn danh).

Giữ bản sao thư đã gửi và dấu thời gian gửi.

## 3. Sau khi gửi

- [ ] Không đẩy thêm lên `main` cho tới khi có kết quả vòng hồ sơ (mỗi lần đẩy sinh bản phát hành mới; Thể lệ chỉ chấm bản có trước hạn).
- [ ] Nếu phải sửa gấp: sửa trên nhánh, mở PR, chờ CI xanh rồi mới gộp; ghi rõ trong CHANGELOG.
- [ ] Chuẩn bị chung kết 10/12: slide ở [docs/slides](slides/index.html), kịch bản 15 phút, máy trình diễn đã nạp dữ liệu mẫu (`docker compose exec workflow-bridge node seed.js --force`).

## 4. Nói thẳng khi trình bày

Danh sách điều chưa làm nằm ở README (mục "Còn thiếu gì") và bảng "Điểm chưa làm" trong [KIEM_THU.md](KIEM_THU.md); đừng nói quá phần chữ ký số (PKI phần mềm, chưa HSM) và lakehouse (JSONL, chưa Parquet/Iceberg).
