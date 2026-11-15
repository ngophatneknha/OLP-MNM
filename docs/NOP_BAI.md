<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Hồ sơ nộp bài và các điều khoản không kiểm bằng máy được

Tài liệu này gom những việc **chỉ người trong đội làm được** theo Đề thi (mục 5) và Thể lệ, kèm mẫu để điền. Phần máy kiểm được nằm trong `tests/luat.test.js` và `tests/pof.test.js`.

## 1. Việc cần xác nhận với Ban tổ chức

**Hạn nộp bài.** Đề thi ghi "17:00 Chủ Nhật ngày 06/12/2025", trong khi cuộc thi diễn ra năm 2026 (thể lệ: chấm kho mã 7-9/12/2026, chung kết 10/12/2026). Ngày 06/12/2026 là Chủ Nhật, nên gần như chắc là gõ nhầm năm. Nên hỏi trên nhóm Telegram của BTC (https://t.me/+YUkj6aM3bnYyOWQ1) để có xác nhận bằng văn bản:

> Kính gửi BTC, đề thi PMNM 2026 mục 5 ghi hạn gửi bài là "17:00 Chủ Nhật ngày 06/12/2025". Chúng em hiểu đây là 06/12/2026 (Chủ Nhật). Nhờ BTC xác nhận giúp. Cảm ơn BTC.

Trong lúc chờ xác nhận, coi hạn là **17:00 ngày 06/12/2026** và nộp sớm hơn ít nhất một ngày.

## 2. Điều kiện của đội (Thể lệ, "Yêu cầu tham gia")

| Điều kiện | Cần làm | Xong |
|---|---|---|
| Đội có không quá 3 thí sinh | Chốt danh sách | ☐ |
| Có một giảng viên của trường dẫn dắt | Xác nhận tên, khoa/viện | ☐ |
| Mỗi trường tối đa 2 đội | Hỏi khoa đã đăng ký mấy đội | ☐ |
| Đội đã đăng ký qua trường | Xin xác nhận đăng ký của trường | ☐ |

## 3. Thư nộp bài

Gửi tới: `olpvietnam@vaip.vn`, `thuky@vfossa.vn`. Hạn: 17:00 Chủ Nhật 06/12 (xem mục 1).

**Tiêu đề:** `BÀI THI PMNM 2026 - [Tên Đội] - [Tên Trường]`

**Nội dung:**

```
Kính gửi BTC cuộc thi PMNM 2026,

Đội thi [Tên Đội] - [Tên Trường] đã hoàn thành bài thi và xin gửi BTC kết quả như sau

Thành viên đội
1. [Tên thành viên 1], [năm sinh], [ngành đào tạo]
2. [Tên thành viên 2], [năm sinh], [ngành đào tạo]
3. [Tên thành viên 3], [năm sinh], [ngành đào tạo]

Người hướng dẫn: [Tên Thầy/Cô] - [Khoa/Viện/Trường]

Kho mã nguồn dự thi: https://github.com/ngophatneknha/OLP-MNM
Bản phát hành dự thi: https://github.com/ngophatneknha/OLP-MNM/releases/latest

Đội thi đã hoàn thành việc đăng kí dự thi theo đúng quy định của BTC thông qua [Tên Trường].
Chúng tôi cam kết toàn bộ bản quyền sử dụng đối với sản phẩm dự thi tuân thủ theo đúng các quy tắc của phần mềm tự do nguồn mở.
```

Mẫu trên giữ nguyên từng câu của đề; chỉ phần trong `[...]` cần điền. Đội chỉ nên ghi những thành viên thật sự tham gia. Nếu chỉ có một hoặc hai người thì ghi đúng như vậy (đề cho phép "không quá 3").

## 4. Kiểm tra trước khi bấm gửi

- [ ] Bản phát hành mới nhất đã được tạo, là `.tar.gz`, và là bản cuối cùng muốn nộp.
- [ ] `node --test --test-reporter=spec tests/*.test.js` đạt trên hệ thống dựng từ bản phát hành giải nén ở thư mục sạch.
- [ ] Kho GitHub ở chế độ công khai, mở bằng cửa sổ ẩn danh vẫn thấy.
- [ ] Đã đổi toàn bộ mật khẩu mặc định (`change-me`) nếu đưa hệ thống lên Internet, và thu hồi khóa AI đang dùng sau cuộc thi.
- [ ] Thư gửi từ địa chỉ của một thành viên, đính kèm không quá cần thiết (kho là bằng chứng chính), lưu lại thư đã gửi.

## 5. Danh sách kiểm tra cuối (bản 2.0.0)

- [ ] Trang [bản phát hành](https://github.com/ngophatneknha/OLP-MNM/releases/latest) có đúng một tệp `.tar.gz`, phiên bản khớp dòng đầu của [CHANGELOG](../CHANGELOG.md); lần chạy CI gần nhất của `main` xanh.
- [ ] Giải nén bản phát hành ở thư mục trống, làm theo README trên máy sạch; chạy `node scripts/demo-platform.mjs` thấy cả bảy bước có dấu ✔.
- [ ] Trên máy trình diễn, đăng nhập `manager1` và `director1` một lần để cài OTP; tập kịch bản demo ([KICH_BAN_DEMO.md](KICH_BAN_DEMO.md)) ít nhất hai lần, quay video dự phòng.
- [ ] Sau khi gửi, không đẩy thêm lên `main` (mỗi lần đẩy sinh bản phát hành mới). Nói thẳng điều chưa làm: PKI phần mềm chưa HSM, lakehouse là JSONL chưa Parquet/Iceberg.
