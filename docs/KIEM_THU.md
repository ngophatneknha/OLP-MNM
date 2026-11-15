<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Báo cáo kiểm thử đối chiếu đề thi và thể lệ

Tài liệu này đối chiếu sản phẩm với ba tài liệu của Ban tổ chức: **Đề thi** (mục 3 "Mục đích yêu cầu" và mục 4 "Yêu cầu kỹ thuật"), **Thể lệ** (bảng tiêu chí chấm điểm) và **Quick Guide DX-OS**. Mọi ca kiểm thử chạy trên hệ thống thật (Keycloak, APISIX, Hasura, PostgreSQL, Flowable, SeaweedFS, ClamAV, AI thật) và trên kho GitHub thật, không giả lập dịch vụ.

```bash
docker compose up -d --build && node tests/wait-ready.js
node --test --test-reporter=spec tests/*.test.js
```

## Phương pháp

- **Ca thuận và ca nghịch.** Mỗi yêu cầu có ít nhất một ca chứng minh nó chạy và một ca đóng vai kẻ phá: token giả, người sai quyền, dữ liệu xấu, tệp độc hại, tải đồng thời.
- **Đối chiếu độc lập.** Số liệu BI được so lại bằng SQL chạy thẳng vào cơ sở dữ liệu, không tin vào chính lớp API đang được kiểm.
- **Dùng chính kho GitHub làm bằng chứng** cho các tiêu chí PoF (kho công khai, bản phát hành, issue, CI), và **giải nén rồi dựng thật** bản phát hành `.tar.gz` ở thư mục tạm.
- **Điểm chưa làm khai báo bằng `todo`**, hiện trong báo cáo kiểm thử là "todo" chứ không phải "đạt", để báo cáo không tô hồng.

## Tiêu chí PoF của thể lệ (nhóm I, 50 điểm, chấm trước chung kết)

| Tiêu chí | Điểm | Ca kiểm thử | Kiểm cái gì |
|---|---|---|---|
| 1. Hệ thống quản lý mã nguồn | 5 | PoF-1.1 – 1.3 | Kho công khai không cần đăng nhập, có web viewer; nhiều commit trên nhiều ngày, nhiều PR đã gộp; CI công khai chạy thành công trên `main` |
| 2. Cấp phép OSI-approved | 10 | PoF-2.1 – 2.7 | Toàn văn Apache-2.0; SPDX trong từng tệp mã; `reuse lint-file` trên mọi tệp được theo dõi; mọi giấy phép dùng đều OSI và có trong `LICENSES/`; thành phần copyleft (ClamAV) có giải trình; đúng đầu bài |
| 3. Bản phát hành | 5 | PoF-3.1 – 3.5 | Có bản phát hành trước hạn; mọi thẻ theo SemVer; chỉ `.tar.gz`; phiên bản khớp CHANGELOG và `package.json`; tải về, giải nén, không lẫn `.env`, `node_modules`, mã dựng sẵn |
| 4. Cài đặt, dịch từ mã nguồn | 10 | PoF-4.1 – 4.6 | Hướng dẫn trong README; cấu hình bằng `.env` (không sửa tay tệp mã); công cụ mở; mọi image ghim phiên bản; không đường dẫn tuyệt đối; **dựng thật image web từ bản phát hành giải nén** |
| 5. Thư viện và gói đính kèm | 10 | PoF-5.1 – 5.5 | Mọi image và thư viện có trong THIRD_PARTY.md; không `node_modules`/`vendor`/nhị phân trong kho; lockfile có mã băm; không vá thư viện; giấy phép thư viện cài thật đều mở |
| 6. Tài liệu và giao tiếp | 10 | PoF-6.1 – 6.5 | README đủ mục; CHANGELOG mỗi thẻ một mục; bug tracker được dùng thật (số issue, đã đóng, có nhãn); liên kết trong README không gãy; mẫu PR, hướng dẫn đóng góp |

## Đề thi mục 3: nền tảng lõi Tầng 1

| Dịch vụ bắt buộc | Mã ca | Kiểm cái gì |
|---|---|---|
| Định danh / SSO | T1-SSO-01…09 | OIDC chuẩn + JWKS + PKCE; token RS256 sống ngắn; sai mật khẩu không lộ ai có thật; client web không nhận mật khẩu trực tiếp; thiếu PKCE và `redirect_uri` lạ bị từ chối; khóa tạm khi dò mật khẩu; có bước TOTP; đăng xuất thu hồi phiên |
| Cổng API | T1-GW-01…12 | Không token, token rác, `alg=none`, sửa nội dung, nhầm thuật toán HS256: đều 401; không nâng vai trò, không mạo danh quản trị; CORS; chỉ các đường dẫn khai báo đi qua; thân quá lớn; truy vấn lồng sâu; giới hạn tần suất 429 rồi khôi phục |
| Headless | T1-HL-01…04 | Chỉ ba cổng công bố ra ngoài; dịch vụ lõi không tới được; console Hasura tắt; Keycloak chế độ production |
| Dữ liệu có cấu trúc | T1-DB-01…07 | Phân quyền theo dòng; không gửi hồ sơ thay người khác; rào chắn dữ liệu (thiếu, sai kiểu, trường lạ, null); chống injection; không sửa/xóa qua API; **nhật ký bất biến ở tầng CSDL**; phiên bản quy trình và danh tính người làm được ghi lại |
| Dữ liệu phi cấu trúc | T1-OBJ-01…08 | Tải lên/tải về đúng từng byte (SHA-256); người ngoài không tải được; giới hạn 10 MB; làm sạch tên tệp; HTML luôn là tệp đính kèm; S3 không mở ngoài; không dòng mồ côi; **tệp EICAR bị ClamAV từ chối** |
| Luồng công việc | T1-WF-01…09 | BPMN thật trong Flowable; nhánh thấp và nhánh cao; từ chối cần lý do; chặn sai người, sai thứ tự, duyệt lặp, tự duyệt; 20 hồ sơ nộp đồng thời không mất cái nào |
| Máy chủ web (Tầng 2) | T1-WEB-01…03 | Không lộ bí mật qua `config.json`; tiêu đề bảo mật; không lộ tệp cấu hình |

## Đề thi mục 3: ứng dụng H-P-D-I (Tầng 2)

| Không gian | Mã ca | Kiểm cái gì |
|---|---|---|
| [P] Quy trình số | P-01…08 | Bản mô tả sai không bao giờ được xuất bản; chống tiêm mã SQL/XML/JUEL qua mã và nhãn; thoát ký tự đặc biệt trong BPMN; mọi quy trình mẫu hợp lệ; chỉ trưởng phòng được tạo; phiên bản bất biến; đề xuất thay đổi có mô phỏng, người đề xuất không tự chấp nhận, hồ sơ cũ giữ phiên bản cũ |
| [D] Dữ liệu số | D-01…05 | View BI khớp dữ liệu gốc bằng SQL độc lập; không lộ qua API; phạm vi nhìn của từng vai trò; dấu thời gian xử lý đúng; chuỗi thời gian đơn điệu |
| [H] Con người số | H-01…02 | Tệp theo quyền hồ sơ; hộp việc theo vai trò |
| [I] Trí tuệ số | I-01…06 | Chỉ trưởng phòng/giám đốc dùng trợ lý soạn; AI thật sinh bản mô tả hợp lệ, đúng vai trò và điều kiện; mô tả tiêm lệnh không lọt vai trò lạ; không giả được danh tính AI; nâng nấc tự chủ cần bằng chứng thật (≥ 10, ≥ 90%, dữ liệu mẫu không tính); AI lỗi không chặn luồng người |

## Điều khoản của Thể lệ và Đề thi ngoài bảng điểm (LUAT)

| Mã ca | Kiểm cái gì |
|---|---|
| LUAT-01 | Kho công khai, GitHub nhận ra giấy phép Apache-2.0, có mô tả |
| LUAT-02 | Không tệp PDF của BTC trong kho |
| LUAT-03, 04 | Lịch sử commit và danh sách người đóng góp không có công cụ, AI hay bot |
| LUAT-05 | Không khóa riêng, token, khóa API trong toàn bộ lịch sử (kể cả khóa AI trong `.env`) |
| LUAT-06 | Mật khẩu mẫu chỉ là giá trị giữ chỗ, README cảnh báo |
| LUAT-07 | Image trên GitHub Packages công khai |
| LUAT-08 | Mọi bản phát hành có ghi chú và tệp, bản mới nhất là "latest" |
| LUAT-09, 10 | Tầng 1 không giao diện; dựng bằng đúng một lệnh |
| LUAT-11 | Có mẫu thư nộp bài đúng quy cách (`docs/NOP_BAI.md`) |

Kết quả rà soát 1.2.1: cài sạch từ bản phát hành 1.2.0 giải nén ở thư mục tạm, 73 đạt, 0 lỗi; quét bí mật trên toàn bộ lịch sử không thấy gì. Điều khoản về con người (số thành viên, giảng viên, đăng ký qua trường, hạn nộp) không kiểm bằng máy: xem `docs/NOP_BAI.md`.

## Lỗi bộ kiểm thử tìm ra và đã sửa (phiên bản 1.1.0)

| # | Phát hiện | Cách sửa |
|---|---|---|
| 1 | Nhật ký "chỉ thêm" chỉ là lời hứa trong chú thích: UPDATE/DELETE trực tiếp vẫn chạy | Trigger chặn UPDATE, DELETE, TRUNCATE trên `submission_event` (T1-DB-06) |
| 2 | Gọi thẳng API vẫn từ chối được hồ sơ mà không nêu lý do (chỉ giao diện bắt buộc) | Ràng buộc `reject_needs_note` ở cơ sở dữ liệu (T1-WF-04) |
| 3 | Tệp mã độc (EICAR) được nhận và lưu | Trạm kiểm dịch ClamAV; lỗi trạm thì từ chối (T1-OBJ-08) |
| 4 | Keycloak không chống dò mật khẩu | Bật brute-force detection trong realm (T1-SSO-07) |
| 5 | Ứng dụng web thiếu tiêu đề bảo mật (CSP, chống nhúng khung, nosniff) | Thêm vào nginx (T1-WEB-02) |
| 6 | Kho thiếu mẫu PR, quy tắc ứng xử; THIRD_PARTY thiếu thành phần copyleft sẽ thêm | Bổ sung (PoF-6.5, PoF-2.6) |

## Điểm chưa làm (khai báo `todo`, nói thẳng)

Đề thi cho các đội "toàn quyền lựa chọn công nghệ" và chỉ bắt buộc bốn dịch vụ lõi cùng **ít nhất một** ứng dụng H-P-D-I. Các mục dưới đây nằm trong khung tham chiếu và nguyên lý "Zero-Trust" của đề (mục 4) nhưng sản phẩm chưa có:

| Mã | Thiếu | Ghi chú |
|---|---|---|
| H-03 | Bảng Kanban và lịch [H] | Có trong BACKLOG |
| D-06 | Lakehouse, NGSI-LD, WebGIS, phả hệ dữ liệu [D] | Ngoài phạm vi hiện tại |
| I-07 | Tìm kiếm toàn văn/vector, OCR, RAG [I] | Chưa làm |
| Z-01 | Két bí mật (Vault) | Bí mật hiện nằm trong `.env` |
| Z-02 | WAF tại biên | Chưa làm |
| Z-03 | Truyền phát sự kiện, WebSocket | Chưa làm |
| Z-04 | Che thông tin định danh (PII) | Chưa làm |
| Z-05 | Sao lưu, khôi phục thảm họa tự động | Chưa làm |
| Z-06 | TLS tại biên, giám sát Prometheus/Grafana | Chưa làm |

## Giới hạn của chính bộ kiểm thử

- Không có kiểm thử giao diện tự động trong trình duyệt: giao diện được kiểm tay (xem README) và logic số liệu được kiểm bằng kiểm thử đơn vị `web/src/metrics.test.js`.
- Ca AI thật phụ thuộc dịch vụ ngoài, có thể bị giới hạn tần suất (429) nên được thử lại rồi mới bỏ qua; ở nấc 4 (AI tự duyệt) không có kiểm thử tự động vì cần khóa AI trong CI.
- Ca PoF-1 đến PoF-3 và PoF-6.3 hỏi GitHub thật nên cần mạng; trên CI dùng `GITHUB_TOKEN` để khỏi bị giới hạn.
- Kiểm thử tải chỉ ở mức 20 hồ sơ đồng thời, đủ để phát hiện mất hồ sơ và tranh chấp, chưa phải kiểm thử hiệu năng quy mô lớn.
