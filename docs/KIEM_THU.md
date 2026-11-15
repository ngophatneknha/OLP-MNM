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
| Dữ liệu phi cấu trúc | T1-OBJ-01…09 | Tải lên/tải về đúng từng byte (SHA-256); người ngoài không tải được; giới hạn 10 MB; làm sạch tên tệp; HTML luôn là tệp đính kèm; S3 không mở ngoài; không dòng mồ côi; **tệp EICAR bị ClamAV từ chối**; **S3 bắt buộc chữ ký SigV4 (không ký/ký sai → 403)** |
| Luồng công việc | T1-WF-01…09 | BPMN thật trong Flowable; nhánh thấp và nhánh cao; từ chối cần lý do; chặn sai người, sai thứ tự, duyệt lặp, tự duyệt; 20 hồ sơ nộp đồng thời không mất cái nào |
| Máy chủ web (Tầng 2) | T1-WEB-01…03 | Không lộ bí mật qua `config.json`; tiêu đề bảo mật; không lộ tệp cấu hình |

## Đề thi mục 3: ứng dụng H-P-D-I (Tầng 2)

| Không gian | Mã ca | Kiểm cái gì |
|---|---|---|
| [P] Quy trình số | P-01…08 | Bản mô tả sai không bao giờ được xuất bản; chống tiêm mã SQL/XML/JUEL qua mã và nhãn; thoát ký tự đặc biệt trong BPMN; mọi quy trình mẫu hợp lệ; chỉ trưởng phòng được tạo; phiên bản bất biến; đề xuất thay đổi có mô phỏng, người đề xuất không tự chấp nhận, hồ sơ cũ giữ phiên bản cũ |
| [D] Dữ liệu số | D-01…05, D-07 | View BI khớp dữ liệu gốc bằng SQL độc lập; không lộ qua API; phạm vi nhìn của từng vai trò; dấu thời gian xử lý đúng; chuỗi thời gian đơn điệu; mức trưởng thành H-P-D-I tính được từ dữ liệu thật (D-07) |
| [H] Con người số | H-01…03 | Tệp theo quyền hồ sơ; hộp việc theo vai trò; bản web phát hành có Kanban, lịch, trang cá nhân, nhãn H/P/D/I |
| [I] Trí tuệ số | I-01…06, I-SEARCH-01…05 | Chỉ trưởng phòng/giám đốc dùng trợ lý soạn; AI thật sinh bản mô tả hợp lệ, đúng vai trò và điều kiện; mô tả tiêm lệnh không lọt vai trò lạ; không giả được danh tính AI; nâng nấc tự chủ cần bằng chứng thật (≥ 10, ≥ 90%, dữ liệu mẫu không tính); AI lỗi không chặn luồng người |

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
| LUAT-12 | Tài liệu người dùng, kỹ thuật, kịch bản demo, slide có đủ, README dẫn tới, liên kết không gãy |

Kết quả rà soát 1.2.1: cài sạch từ bản phát hành 1.2.0 giải nén ở thư mục tạm, 73 đạt, 0 lỗi; quét bí mật trên toàn bộ lịch sử không thấy gì. Điều khoản về con người (số thành viên, giảng viên, đăng ký qua trường, hạn nộp) không kiểm bằng máy: xem `docs/NOP_BAI.md`.

## Vận hành và an toàn (phiên bản 1.4.0)

| Mã ca | Kiểm cái gì |
|---|---|
| T1-SSO-10 | Đi qua trang đăng nhập thật: trưởng phòng và giám đốc bị chuyển sang thiết lập OTP, không nhận mã đăng nhập khi chưa có OTP; nhân viên đăng nhập thẳng |
| OPS-01, 02 | Có script sao lưu và khôi phục (kiểm mã băm); thành phần tùy chọn không lẫn vào compose lõi |
| OPS-03 | HTTPS qua Caddy cho web, API, đăng nhập; có HSTS; qua TLS cổng vẫn trả 401 khi không token |
| OPS-04 | Prometheus thu được số đo APISIX và thấy yêu cầu thật |
| OPS-06 | Mọi dịch vụ chạy lâu của luồng chính có `restart` và kiểm tra sức khỏe |
| OPS-07 | Cho tiến trình chính của web và kho S3 thoát đột ngột: Docker tự chạy lại và dịch vụ khỏe trở lại (chạy bằng `RECOVERY_TEST=1`; `docker kill` là dừng thủ công nên không dùng) |
| D-04b | Trưởng phòng và giám đốc đọc đủ nhật ký của hồ sơ họ được xem, người không liên quan không thấy; hồ sơ đã xong qua đúng quy trình có nhật ký đủ |
| DEMO | Sau `seed.js`, điểm H-P-D-I tính riêng trên các quy trình mẫu hợp lý, `tam_ung` có phiên bản 2 (`tests/demo.check.js`) |
| OPS-RESTORE | Sao lưu, xóa bảng và thêm hồ sơ mới, khôi phục: hồ sơ trở về đúng lúc sao lưu, tệp đính kèm giống từng byte (chạy bằng `RESTORE_TEST=1`) |
| OPS-BACKUP | Dịch vụ `backup` (profile `backup`) chạy được: ra ba cơ sở dữ liệu kèm mã băm hợp lệ, đọc lại được |
| OPS-GITOPS | `scripts/gitops.sh check` xác nhận compose, metadata Hasura, tuyến cổng API trong kho hợp lệ |

## Kho lạnh, phả hệ và nạp hàng loạt (phiên bản 1.8.1)

| Mã | Kiểm tra | Cách thực hiện |
|---|---|---|
| COLD-01 | Hồ sơ đã kết thúc được xuất ra tệp JSONL (kèm nhật ký) trong bucket `dxlab-cold`, ghi vào sổ cái; chạy lại không xuất trùng | Chạy hồ sơ tới `approved`, giám đốc gọi `POST /archive?days=0` |
| COLD-02 | Sổ cái nối chuỗi mã băm liền mạch và mọi tệp khớp mã băm | `GET /archive/verify` |
| COLD-03 | Sổ cái không sửa/xóa được kể cả bằng SQL của chủ sở hữu; sửa một tệp thì kiểm chứng báo lỗi, trả lại thì hết lỗi | Trigger `forbid_change`; ghi đè tệp thật trong S3 rồi kiểm |
| COLD-05 | Mỗi dòng tệp JSONL là một JSON hợp lệ có đủ sự kiện (từng bị lỗi xuống dòng trong `json_agg`, đã sửa) | đọc tệp trong S3 |
| COLD-04 | Chỉ giám đốc vận hành kho lạnh | Nhân viên, trưởng phòng bị 403; không token bị 401 |
| LAKE-01 | SQL trên kho lạnh bằng DuckDB (`scripts/cold-sql.sh`): hồ sơ đã xuất hiện trong bảng ảo `cold` theo đúng tổ chức, đọc được dữ liệu và nhật ký sự kiện | DuckDB đọc S3 bằng SigV4 |
| LIN-01 | Phả hệ lấy tự động từ danh mục PostgreSQL: view báo cáo của ứng dụng vừa xuất bản truy ngược về bảng nguồn | `GET /lineage` |
| ING-01 | Nạp CSV nhiều dòng: dòng đúng được nhận, dòng sai bị từ chối kèm số dòng, rào chắn của CSDL vẫn nguyên | `POST /ingest?app=<mã>` bằng token nhân viên |
| ING-02 | Nạp JSON; ứng dụng lạ 404; quá 500 dòng 413; không token 401 | như trên |

Giới hạn nói thẳng: kho lạnh là tệp JSONL, chưa phải bảng Parquet/Iceberg; bản sao trong cơ sở dữ liệu nóng được giữ nguyên (chưa xóa sau khi xuất); sổ cái chống sửa ở tầng CSDL và băm chuỗi, nhưng chưa có neo bên ngoài (ví dụ ký thời gian) để chống người nắm cả CSDL lẫn kho S3 viết lại toàn bộ chuỗi.

## Cảm biến IT/OT (phiên bản 1.8.2)

| Mã | Kiểm tra | Cách thực hiện |
|---|---|---|
| IOT-01 | Chỉ giám đốc đăng ký cảm biến; token thiết bị trả một lần (CSDL chỉ giữ mã băm); ứng dụng sửa chữa phải đủ trường | `POST /sensors` |
| IOT-02 | Số đo trong ngưỡng chỉ được ghi; vượt ngưỡng thì tự mở hồ sơ đúng ứng dụng, đúng dữ liệu, chờ trưởng phòng | `POST /telemetry/<mã>` bằng token thiết bị |
| IOT-03 | Vượt ngưỡng liên tục không ngập hồ sơ: còn hồ sơ đang chạy thì dùng lại | nhiều số đo trong một lần gửi |
| IOT-04 | Không token, sai token và cảm biến không tồn tại cùng bị 401; số đo sai, quá cũ, ở tương lai, quá 100 bị 400 | như trên |
| IOT-05 | Số đo bất biến ở tầng CSDL; "bản sao số" `GET /sensors` phản ánh trạng thái hiện tại; nhân viên bị 403 | trigger `forbid_change` |
| IOT-08 | Vị trí lat/lon hợp lệ; thực thể NGSI-LD `Device` có `GeoProperty`, `observedAt`; chỉ trưởng phòng/giám đốc cùng tổ chức đọc được | `GET /ngsi-ld/v1/entities` |
| IOT-06 | Hồ sơ sửa chữa đi hết quy trình (trưởng phòng duyệt, kỹ thuật viên xác nhận); vượt ngưỡng lại thì mở hồ sơ mới | luồng thật qua Flowable |
| IOT-07 | Nhiều số đo vượt ngưỡng đến cùng lúc chỉ mở một hồ sơ (khóa theo cảm biến) | 8 yêu cầu song song |

Giới hạn nói thẳng: thiết bị gọi HTTP (chưa có MQTT/OPC UA); ngưỡng một chiều; token thiết bị gửi qua HTTP thường nên môi trường thật phải đặt sau TLS (profile `tls`); hai số đo vượt ngưỡng đến cùng lúc có thể mở hai hồ sơ (chưa khóa theo cảm biến).

## Đa tổ chức (phiên bản 1.8.4)

Hai tổ chức dùng chung một hệ thống: tổ chức mặc định (`staff1`, `manager1`, `director1`...) và tổ chức B (`staffb1`, `managerb1`, `directorb1`, `org_id = orgb`). Bộ kiểm thử: `tests/tenant.test.js`.

| Mã | Kiểm tra | Cách thực hiện |
|---|---|---|
| ORG-01 | `org_id` đi theo token (claim của Keycloak); tài khoản cũ không có claim là tổ chức mặc định | giải mã token |
| ORG-02 | Mỗi tổ chức chỉ thấy quy trình của mình, kể cả trưởng phòng và giám đốc; `org_id` của quy trình do token đặt, không do người gửi chọn | GraphQL qua cổng API |
| ORG-03 | Hồ sơ cách ly; người của B không gửi được vào quy trình của A | GraphQL, đối chiếu SQL |
| ORG-04 | Không duyệt được hồ sơ của tổ chức khác; duyệt trong tổ chức mình vẫn chạy trọn qua Flowable | luồng thật |
| ORG-05 | Phiên bản, đề xuất, góp ý, nấc AI và nhật ký cũng cách ly | GraphQL |
| ORG-06 | Mỗi người chỉ đọc được dòng tổ chức của mình | bảng `org` |
| ORG-07 | Tự thêm tiêu đề `x-hasura-org-id` không đổi được tổ chức; sửa `org_id` trong token thì chữ ký sai, bị 401 | giả mạo |
| ORG-08 | Không đính tệp vào hồ sơ của tổ chức khác | `POST /files` |
| ORG-09 | Kho lạnh: mỗi tổ chức một chuỗi sổ cái riêng, tệp dưới thư mục tổ chức, liệt kê và kiểm chứng không lẫn | `/archive*` |
| ORG-10 | Cảm biến: ứng dụng sửa chữa phải cùng tổ chức; hồ sơ tự mở mang tổ chức của cảm biến | `/sensors`, `/telemetry` |
| ORG-11 | Nạp hàng loạt đi bằng quyền người nạp nên không nạp chéo tổ chức | `POST /ingest` |

### Chữ ký số (PKI)

Tệp `tests/pki.test.js`. Mỗi hành động duyệt/từ chối của người được ký (RSA-SHA256) bằng chứng thư X.509 do CA của tổ chức cấp; chữ ký chỉ thêm, không sửa.

| Mã | Kiểm tra | Cách thử |
|---|---|---|
| PKI-01 | Duyệt xong thì sự kiện có chữ ký; kiểm chứng trả về hợp lệ | `GET /signatures/verify` |
| PKI-02 | Chứng thư do CA cấp, chữ ký kiểm chứng bằng thư viện mật mã chuẩn; sửa nội dung thì chữ ký sai | `node:crypto` X509 |
| PKI-03 | Chữ ký và khóa không sửa/xóa được; khóa riêng luôn mã hóa và không mở qua Hasura | SQL, GraphQL |
| PKI-04 | Mỗi tổ chức một CA riêng; tải được chứng thư CA | `GET /pki/ca` |
| PKI-05 | Người ngoài tổ chức không đọc được chữ ký | GraphQL, `/signatures/verify` |
| PKI-06 | Không token bị chặn tại biên; mã hồ sơ sai bị từ chối | cổng API |
| PKI-07 | Hành động của AI không bị ký thay người | SQL |

Giới hạn nói thẳng: mã ứng dụng (`app.key`) vẫn duy nhất toàn hệ thống, nên tổ chức khác dùng trùng mã sẽ bị báo trùng (lộ việc mã đó đã tồn tại); chỉ lập tổ chức mới bằng SQL và quản trị Keycloak (chưa có màn hình quản trị tổ chức); chỉ mục tìm kiếm Meilisearch dùng chung nhưng mọi kết quả đều được kiểm quyền qua Hasura trước khi trả về; các view báo cáo `bi.*` chưa tách theo tổ chức; tài khoản mẫu của tổ chức B không bắt OTP trên API (cùng cách `dxlab-cli` của các tài khoản khác).

## Tìm kiếm và hỏi đáp (phiên bản 1.5.0)

| Mã ca | Kiểm cái gì |
|---|---|
| I-SEARCH-01 | Người gửi tìm thấy nội dung tệp đính kèm của mình, từ khớp được đánh dấu |
| I-SEARCH-02 | Nhân viên khác tìm cùng từ khóa: không có kết quả, không lộ nội dung (quyền do Hasura quyết định) |
| I-SEARCH-03 | Hỏi đáp: người không có quyền nhận câu trả lời rỗng; người có quyền nhận đúng nguồn, câu trả lời của AI dẫn số nguồn |
| I-SEARCH-04 | Không token 401; JSON hỏng, câu hỏi rỗng hoặc quá dài 400 |
| I-SEARCH-05 | Nội dung có mã HTML trả về như chữ thường |

## Lỗi bộ kiểm thử tìm ra và đã sửa (phiên bản 1.1.0)

| # | Phát hiện | Cách sửa |
|---|---|---|
| 1 | Nhật ký "chỉ thêm" chỉ là lời hứa trong chú thích: UPDATE/DELETE trực tiếp vẫn chạy | Trigger chặn UPDATE, DELETE, TRUNCATE trên `submission_event` (T1-DB-06) |
| 2 | Gọi thẳng API vẫn từ chối được hồ sơ mà không nêu lý do (chỉ giao diện bắt buộc) | Ràng buộc `reject_needs_note` ở cơ sở dữ liệu (T1-WF-04) |
| 3 | Tệp mã độc (EICAR) được nhận và lưu | Trạm kiểm dịch ClamAV; lỗi trạm thì từ chối (T1-OBJ-08) |
| 4 | Keycloak không chống dò mật khẩu | Bật brute-force detection trong realm (T1-SSO-07) |
| 5 | Ứng dụng web thiếu tiêu đề bảo mật (CSP, chống nhúng khung, nosniff) | Thêm vào nginx (T1-WEB-02) |
| 7 | Tệp kho lạnh JSONL có dòng bị ngắt giữa chừng khi hồ sơ có từ hai sự kiện (`json_agg` chèn xuống dòng); lộ ra khi đọc bằng DuckDB | Dùng `jsonb_agg` (COLD-05); tệp cũ vẫn kiểm chứng băm được, công cụ SQL bỏ qua tệp hỏng và báo |
| 6 | Kho thiếu mẫu PR, quy tắc ứng xử; THIRD_PARTY thiếu thành phần copyleft sẽ thêm | Bổ sung (PoF-6.5, PoF-2.6) |

## Điểm chưa làm (khai báo `todo`, nói thẳng)

Đề thi cho các đội "toàn quyền lựa chọn công nghệ" và chỉ bắt buộc bốn dịch vụ lõi cùng **ít nhất một** ứng dụng H-P-D-I. Các mục dưới đây nằm trong khung tham chiếu và nguyên lý "Zero-Trust" của đề (mục 4) nhưng sản phẩm chưa có:

| Mã | Thiếu | Ghi chú |
|---|---|---|
| D-06 | Bảng lakehouse Parquet/Iceberg có lược đồ phiên bản; NGSI-LD ghi và thuê bao; bản đồ có nền (tile) [D] | Đã có: SQL DuckDB trên tệp JSONL (LAKE-01), NGSI-LD chỉ đọc và bản đồ SVG tối giản (IOT-08), phả hệ, nạp hàng loạt (LIN, ING) |
| I-07 | Tìm kiếm toàn văn/vector, OCR, RAG [I] | Chưa làm |
| Z-07 | HSM giữ khóa, thu hồi chứng thư (CRL/OCSP), ký ở trình duyệt | Chữ ký số PKI phần mềm đã có (PKI-01 đến PKI-07); khóa nằm trong CSDL (mã hóa), ký phía máy chủ |
| Z-09 | WebSocket cho thời gian thực, MQTT/OPC UA cho thiết bị | Hiện là SSE (Z-03) và HTTP (IOT) |
| Z-10 | GitOps thật (ArgoCD/Flux: nhiều máy, tự hoàn tác) | Đã có GitOps nhẹ cho một máy: `scripts/gitops.sh check/apply/watch` (OPS-GITOPS) |
| Z-11 | Gom nhật ký truy vết phân tán; trục sự kiện streaming | Hiện có nhật ký kiểm toán bất biến trong CSDL, SSE và Prometheus |

## Zero-Trust: các ca đã làm (nguyên lý iv của đề)

| Mã | Nội dung | Ghi chú nói thẳng |
|---|---|---|
| Z-01 | Két bí mật **OpenBao**: `scripts/vault.sh init` chép mọi mật khẩu/khóa/token trong `.env` vào két, `up` chạy hệ thống với bí mật lấy từ két; không token thì két từ chối | Thành phần tùy chọn (profile `vault`). Khóa mở và token gốc nằm ở `.vault-keys`, người vận hành phải cất ra ngoài; mở khóa bằng một khóa duy nhất (chưa chia khóa Shamir, chưa tự mở khóa) |
| Z-02 | **Coraza + OWASP CRS** trước cổng API (profile `waf`, cổng 9081): SQL injection, XSS, đi ngược thư mục bị 403, yêu cầu sạch đi tiếp | Mặc định người dùng vẫn đi thẳng cổng 9080; bật WAF là dùng 9081. Chưa chỉnh luật riêng cho GraphQL, có thể cần loại trừ khi gặp báo nhầm |
| Z-03 | **Thời gian thực** bằng SSE qua cổng API: không token bị 401, có token nhận nhịp ngay khi ứng dụng xuất bản và khi có hồ sơ mới; mọi màn hình dùng chung một kênh (`web/src/live.js`, có kiểm thử đơn vị) | Là SSE, không phải WebSocket (đề tham chiếu Centrifugo). Kênh chỉ đẩy nhịp rỗng, dữ liệu vẫn qua GraphQL kiểm quyền; một tiến trình bridge giữ danh sách kết nối |
| OPS-08 | **Tài nguyên**: bản lõi dùng dưới 5 GiB RAM khi nhàn rỗi, đo thật bằng `docker stats` (`scripts/measure.sh` in từng dịch vụ) | Đo trên máy phát triển: khoảng 3 GiB cho 9 dịch vụ lõi, trong đó ClamAV gần 1 GiB và Keycloak 650 MiB; thành phần tùy chọn tách profile để máy yếu bỏ qua |
| Z-04 | **Ẩn thông tin cá nhân** (email, số điện thoại, CCCD, số thẻ) trước khi gửi tới máy chủ AI; kiểm bằng máy chủ AI giả ghi lại nội dung nhận được | Nhận dạng theo mẫu, chưa nhận được họ tên và địa chỉ |

## Đối chiếu lần cuối với Đề thi (phiên bản 1.8.0)

| Yêu cầu của Đề | Tình trạng | Bằng chứng |
|---|---|---|
| Mục 3: nền tảng lõi headless gồm SSO, cổng API, dữ liệu cấu trúc và phi cấu trúc, luồng công việc | Đạt | `T1-SSO`, `T1-GW`, `T1-HL`, `T1-DB`, `T1-OBJ`, `T1-WF` |
| Mục 3: ít nhất một ứng dụng H-P-D-I ở Tầng 2 | Đạt, đủ bốn không gian | `tests/hpdi.test.js` (H, P, D, I) |
| Nguyên lý (iv): Zero-Trust, MFA, kiểm dịch mã độc tại biên | Đạt | T1-SSO-10, T1-OBJ-08, Z-01, Z-02, Z-04 |
| Nguyên lý (iv): cấu hình hạ tầng bằng mã, tự phục hồi tức thì | Đạt | `docker-compose.yml`, OPS-06, OPS-07 |
| Lớp 1 tham chiếu: truyền phát trạng thái thời gian thực | Đạt bằng SSE (không dùng WebSocket) | Z-03 |
| Nguyên lý (i): tự động đẩy dữ liệu lịch sử xuống kho lạnh | Đạt ở mức tệp JSONL bất biến trong S3 (chưa phải bảng lakehouse Parquet/Iceberg) | COLD-01 đến COLD-04 |
| Nguyên lý (ii): hội tụ IT/OT, dữ liệu cảm biến | Đạt ở mức HTTP: cảm biến gửi số đo bằng token riêng, vượt ngưỡng tự mở hồ sơ sửa chữa qua quy trình của người | IOT-01 đến IOT-07 |
| Nguyên lý (iii): phả hệ dữ liệu | Đạt: lấy tự động từ danh mục PostgreSQL, thêm luồng xuống kho lạnh và số liệu | LIN-01 |
| Chứng thư số (PKI) cho chữ ký phê duyệt | Đạt ở mức PKI phần mềm: mỗi duyệt/từ chối được ký bằng chứng thư X.509 do CA của tổ chức cấp. **Chưa** có HSM, CRL/OCSP; không phải chữ ký số có giá trị pháp lý theo luật | PKI-01 đến PKI-07; nói thẳng khi trình bày |

Điều khoản của Thể lệ và Đề thi ngoài bảng điểm (hạn nộp, kho công khai, giấy phép OSI, không bí mật trong lịch sử, bản phát hành...) do nhóm `LUAT` kiểm. Hạn nộp trong Đề ghi năm 2025 trong khi cuộc thi là 2026: cần hỏi Ban tổ chức xác nhận.

## Giới hạn của chính bộ kiểm thử

- Không có kiểm thử giao diện tự động trong trình duyệt: giao diện được kiểm tay (xem README) và logic số liệu được kiểm bằng kiểm thử đơn vị `web/src/metrics.test.js`.
- Ca AI thật phụ thuộc dịch vụ ngoài, có thể bị giới hạn tần suất (429) nên được thử lại rồi mới bỏ qua; ở nấc 4 (AI tự duyệt) không có kiểm thử tự động vì cần khóa AI trong CI.
- Ca PoF-1 đến PoF-3 và PoF-6.3 hỏi GitHub thật nên cần mạng; trên CI dùng `GITHUB_TOKEN` để khỏi bị giới hạn.
- Kiểm thử tải chỉ ở mức 20 hồ sơ đồng thời, đủ để phát hiện mất hồ sơ và tranh chấp, chưa phải kiểm thử hiệu năng quy mô lớn.
