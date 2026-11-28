<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Changelog

Định dạng theo [Keep a Changelog](https://keepachangelog.com/vi/1.1.0/), đánh số phiên bản theo [SemVer](https://semver.org/lang/vi/).

## [Unreleased]

## [2.6.0] - 2026-11-27

### Added
- D-06 NGSI-LD ghi và thuê bao: `POST /ngsi-ld/v1/entities` tạo `Device` (giám đốc, trả token thiết bị một lần), `PATCH /ngsi-ld/v1/entities/{id}/attrs` ghi số đo đi chung đường với `/telemetry`, `POST/GET/DELETE /ngsi-ld/v1/subscriptions` gửi `Notification` khi số đo thỏa `q` (có `throttling`, trạng thái `timesSent`, `lastFailure`). Chống SSRF: máy nhận phải nằm trong `NGSI_NOTIFY_ALLOW`; lúc gửi, bridge phân giải DNS rồi chặn địa chỉ nội bộ, link-local, 169.254.169.254 (metadata đám mây), IPv6 nội bộ và kết nối đúng địa chỉ đã kiểm (chống DNS rebinding), trừ tên trong `NGSI_NOTIFY_PRIVATE`; không theo chuyển hướng, quá 5 giây thì hủy. Mỗi tổ chức tối đa `NGSI_MAX_SUBSCRIPTIONS` thuê bao (mặc định 50). Bảng mới `ngsi_subscription` (`infra/postgres/init/09-ngsi.sql`). Ca IOT-09 đến IOT-12. Tự viết trong bridge vì Orion-LD là AGPL-3.0.
- D-06 nền bản đồ tự chứa: ranh giới 34 tỉnh, thành sau sắp xếp đơn vị hành chính từ 01/7/2025 (Nghị quyết 202/2025/QH15, gộp đa giác 63 tỉnh cũ) và quần đảo Hoàng Sa, Trường Sa (`web/public/basemap-vn.json`, 48 KB, Natural Earth 1:10m v5.1.2, public domain), dựng lại bằng `scripts/basemap.mjs`; bản đồ cảm biến vẽ nền cùng phép chiếu với điểm và ghi tên khu vực. Không tải ô bản đồ hay mã từ bên ngoài.
- D-06 bảng Apache Iceberg của kho lạnh: `scripts/lake.sh sync|info|sql` nạp tệp JSONL vào bảng `cold.submission` (Parquet trong S3, danh mục trong PostgreSQL, phân vùng theo tổ chức); trường mới thêm cột và tăng phiên bản lược đồ; đọc lại ảnh chụp cũ; tệp hỏng hay trái kiểu bị bỏ qua có lý do. `expire` xóa ảnh chụp quá hạn `LAKE_SNAPSHOT_DAYS` (mặc định 30 ngày) và tệp không còn dùng; `compact` gộp tệp nhỏ; `forget <mã hồ sơ>` xóa hẳn một hồ sơ khỏi bảng và mọi ảnh chụp cũ theo Luật Bảo vệ dữ liệu cá nhân 91/2025/QH15; lệnh ghi giữ khóa `pg_advisory_lock`. PyIceberg 0.10.0, PyArrow 21.0.0, SQLAlchemy 2.0.45, pg8000 1.31.2. Ca LAKE-02 đến LAKE-07.
- Z-11 nhật ký tập trung có mã truy vết: APISIX gắn `X-Request-Id` (plugin `request-id`) và ghi nhật ký truy cập JSON; mã do bên gọi gửi sai dạng thì cổng thay bằng UUID mới; workflow-bridge ghi nhật ký truy cập cùng mã (che PII, không ghi chuỗi truy vấn); profile `logs` chạy Vector 0.61.0 (MPL-2.0, che token Bearer, JWT, token Vault, cookie và PII) gửi vào VictoriaLogs 1.53.0 (Apache-2.0, chỉ mở trên 127.0.0.1). Đây là ghép nhật ký theo mã (log correlation), chưa phải truy vết phân tán OpenTelemetry. Ca TRACE-01 đến TRACE-05 (`tests/trace.test.js`).
- Z-11 truy vết phân tán OpenTelemetry: APISIX (plugin `opentelemetry`, mã ngẫu nhiên, lấy mẫu theo `OTEL_SAMPLER`, mặc định tắt) mở chuỗi truy vết và gửi `traceparent` W3C xuống; workflow-bridge (`trace.js`, tự viết, không thêm gói npm) nối tiếp với span cho yêu cầu, từng câu SQL và từng lần gọi Hasura, Flowable, SeaweedFS, rồi gửi OTLP/HTTP JSON; Jaeger 2.22.0 (Apache-2.0, profile `logs`, lưu Badger `TRACE_RETENTION` mặc định 7 ngày, giao diện chỉ 127.0.0.1:16686) bỏ chuỗi truy vấn và User-Agent trước khi lưu. Phản hồi mang `traceparent`, nhật ký truy cập của cổng và bridge mang `trace_id`. Ca TRACE-06 đến TRACE-08, kiểm thử đơn vị `trace.test.js` với máy nhận OTLP giả.
- Z-11 nhật ký thay đổi dữ liệu `audit_log` (`infra/postgres/init/11-audit.sql`): trigger trên 11 bảng còn sửa được ghi ai sửa (từ token, hoặc người bấm mà bridge làm thay qua `dx.actor` và tiêu đề `x-hasura-dx-*`), vai trò, cột nào đổi từ gì sang gì, `trace_id`; cột nhạy cảm (dữ liệu hồ sơ, tên người, nội dung tự do, khóa) chỉ ghi "đã đổi"; chỉ thêm và nối chuỗi băm SHA-256, `GET /audit/verify` chỉ ra dòng bị sửa lén. `GET /audit?table=&key=` xem lịch sử một dòng, Hasura cho giám đốc đọc `audit_log` của tổ chức mình. Ca AUDIT-01 đến AUDIT-04.
- Z-11 dòng đời một hồ sơ `GET /lineage/submission/{id}`: tạo, sửa, duyệt (có chữ ký số), phát NATS, xuống kho lạnh ở tệp nào (mã băm), nạp vào ảnh chụp Iceberg nào hay đã xóa theo yêu cầu, và các `trace_id`. `lake.sh` ghi bảng `lake_event` (chỉ thêm; `forget` chỉ lưu mã băm). Ca LINEAGE-01, LINEAGE-02, LAKE-08.
- Z-11 trục sự kiện streaming: profile `stream` chạy NATS 2.14.10 có JetStream (Apache-2.0); workflow-bridge phát mỗi dòng `submission_event` lên `dx.<tổ chức>.submission.<hành động>` theo mẫu outbox: đánh dấu từng sự kiện đã được ack trong `stream_published` (giao dịch commit trễ không bị bỏ sót), `Nats-Msg-Id` chống trùng trong cửa sổ 1 giờ, bên nghe bỏ trùng theo `event_id`, hợp đồng thuê để chỉ một bản bridge phát; máy khách NATS tối giản không thêm gói npm, báo lỗi ngay khi máy chủ đóng kết nối lúc khởi động. NATS tắt thì việc duyệt vẫn chạy, tin được phát bù. Ca STREAM-01 đến STREAM-05, kiểm thử đơn vị `stream.test.js` với máy chủ NATS giả.

### Changed
- `tests/hpdi.test.js`: D-06 và Z-11 không còn là `todo`; chỉ còn Z-07 (HSM), Z-09 (WebSocket, MQTT), Z-10 (ArgoCD/Flux).
- CORS của route NGSI-LD cho phép thêm `PATCH`, `DELETE`.
- APISIX chỉ nạp các plugin thật sự dùng (khai báo `plugins` trong `infra/apisix/config.yaml`), thêm `opentelemetry`.
- Lệnh GraphQL quản trị của workflow-bridge dùng chung `adminHeaders()` (mang người làm và mã truy vết cho `audit_log`).
- `scripts/gitops.sh apply` nay áp migration (`scripts/migrate.sh` mới) và tạo lại dịch vụ gắn tệp cấu hình vừa đổi; chạy lại khi kho không đổi chỉ `up -d`. Hướng dẫn nâng cấp từ 2.5.0 ở `docs/VAN_HANH.md`.

### Fixed
- Máy đang chạy bản cũ nâng cấp bằng `gitops.sh apply` không nhận bảng SQL mới (PostgreSQL chỉ chạy tệp khởi tạo trên volume trống) và cổng API, Keycloak, bridge vẫn đọc tệp cấu hình cũ: nay tự áp `05-*.sql` trở đi và tạo lại các dịch vụ đó. Ca OPS-MIGRATE.

## [2.5.0] - 2026-11-22

### Added
- AI-02 tìm ngữ nghĩa bằng Qdrant (cách khuyên dùng): profile `vector` mới gồm Qdrant 1.20.2 và dịch vụ nhúng Text Embeddings Inference 1.9 bản CPU (đều Apache-2.0) chạy bản int8 chính thức của `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (Apache-2.0, chỉ cần CPU, tải một lần có kiểm sha256); Meilisearch chỉ còn lo từ khóa, `workflow-bridge` trộn hai bên theo điểm rồi kiểm quyền qua Hasura như cũ (`vector.js`, không thêm gói npm). Không dùng Ollama nên không tranh tài nguyên với mô hình ngôn ngữ; tiền tố (nếu mô hình cần) đặt qua biến môi trường. Tài liệu mới tải lên SeaweedFS tự được nhúng vào Qdrant và tìm được bằng câu diễn đạt khác sau chưa tới 10 giây; mỗi lần khởi động `workflow-bridge` dựng lại kho véc-tơ nên đổi mô hình chỉ cần khởi động lại. Đo 39 câu: 33/39 đúng hạng 1 (chỉ từ khóa 28/39), p95 210 ms khi 8 người cùng tìm câu mới, RAM dịch vụ nhúng 0,48 GB (cả phần ngữ nghĩa ~0,7 GB). Máy chủ mạnh có thể đổi sang `gte-multilingual-base` (39/39, RAM 1,56 GB) bằng biến môi trường. Dịch vụ nhúng hay Qdrant chết thì tìm kiếm lùi về từ khóa, không lỗi 503 khi đông người; phần véc-tơ được nạp bù khi dịch vụ sống lại.
- `eval-search.mjs` thêm chế độ `qua-bridge`: đo 39 câu qua đúng mã bridge (kể cả kiểm quyền) với Meilisearch hoặc Qdrant tùy biến môi trường; `bao-mat` chạy được với Qdrant.
- `scripts/eval-search.mjs`: bộ đo trước triển khai, chỉ cần một container Meilisearch: chất lượng (39 câu hỏi, 5 nhóm, kho 312 tài liệu có nhiễu), câu lạc đề, độ trễ p50/p95 khi 8 người tìm cùng lúc, thời gian khởi động lại, và chế độ `bao-mat` chạy đúng mã bridge để kiểm rò rỉ quyền, trường hợp xấu (tệp 100.000 ký tự, emoji, CSV, tiếng Anh, câu hỏi dài) và đầu vào xấu.
- `search-guard.test.js`: hàng rào kiến trúc và bảo mật chạy không cần Docker: bridge không dùng gói npm, Meilisearch là bản Community không mở cổng, kết quả và ngữ cảnh hỏi đáp chỉ gồm hồ sơ Hasura cho phép (kiểm bằng token người hỏi, với cả ba chế độ tìm), lùi về từ khóa khi mô hình chưa sẵn sàng.

### Changed
- Meilisearch nâng từ 1.11.3 lên 1.57.0 (bản Community, MIT); máy ít RAM có thể để nó tự nhúng bằng `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (Apache-2.0) qua `SEARCH_EMBEDDER`, không thêm container. Mô hình lưu trong volume riêng `meilimodels`, xóa chỉ mục hay dựng lại container không phải tải lại. Đo trên kho 312 tài liệu với 39 câu hỏi tiếng Việt (diễn đạt khác chữ, tra mã số, không dấu, gõ sai, nằm sâu trong tệp dài): đúng hạng 1 từ 28/39 (chỉ từ khóa) lên 33/39; RAM khoảng 950 MB (xem `docs/TRI_TUE.md`). Nâng cấp cần xóa volume `meilidata` một lần (chỉ mục tự dựng lại từ Hasura).
- Tệp dài được chia đoạn khoảng 450 ký tự, chồng nhau; mỗi tệp chỉ trả về đoạn khớp nhất. Đoạn trích và ngữ cảnh RAG chính xác hơn; kiểm quyền qua Hasura giữ nguyên.

### Fixed
- Bật mô hình nhúng thì Meilisearch từ chối nạp mọi hồ sơ (mẫu nhúng dùng `{{doc.name}}` mà hồ sơ không có trường `name`): nay mọi tài liệu đều có `name`; thêm kiểm thử đối chiếu trường của mẫu với mọi loại tài liệu.
- Cắt đoạn trúng giữa emoji làm Meilisearch từ chối cả lô và bridge gửi lại mãi: không cắt đôi ký tự, thay nửa ký tự còn sót bằng U+FFFD.
- Tệp lớn (100.000 ký tự, hơn 220 đoạn) có thể nạp quá thời gian chờ rồi gửi lại từ đầu mãi: nạp theo lô 200 đoạn, lỗi giữa chừng chỉ gửi lại phần thiếu.
- Nạp tệp lớn khi bật mô hình làm Meilisearch vượt 1,2 GB RAM và bị tắt: giới hạn `MEILI_MAX_INDEXING_THREADS=2`, `MEILI_MAX_INDEXING_MEMORY=512 MiB` (đỉnh còn khoảng 920 MB).
- Giới hạn byte của mẫu nhúng nâng từ 1000 lên 2000: đoạn 450 ký tự tiếng Việt có dấu có thể vượt 1000 byte và mất phần cuối khi nhúng.
- Bật `SEARCH_EMBEDDER` mà mô hình chưa tải được (máy không ra mạng) không còn làm hỏng cả tìm kiếm: tự lùi về tìm từ khóa.
- Bỏ lệnh bật `vectorStore` thử nghiệm, Meilisearch mới đã bỏ cờ này và từ chối yêu cầu.
- Chờ Meilisearch nạp tối đa 5 phút thay vì 10 giây, để lần nhúng đầu tiên không bị coi là lỗi rồi gửi lại mãi.
- Dịch vụ nhúng chưa sẵn sàng lúc khởi động thì mỗi câu tìm gặp lỗi "Collection doesn't exist" và bridge quên hết tệp đã nạp (phải đọc, OCR lại toàn bộ): nay chỉ nạp lại khi kho véc-tơ đã dựng rồi mới mất, và tạm ngừng hỏi Qdrant 30 giây.
- ClamAV tạm giữ hai bản mẫu nhận dạng (~2 GB) khi tự cập nhật nên hết RAM trên máy Docker 4 GB có bật profile `vector`: nạp lại tuần tự (`ConcurrentDatabaseReload no`), đỉnh còn khoảng 950 MB; đổi lại tải tệp lên chờ quét khoảng nửa phút mỗi lần cập nhật.
- Kiểm thử tìm kiếm chờ đúng tệp cần tìm thay vì "có kết quả là xong", và chỉ cấm thấy hồ sơ ngoài quyền: tìm ngữ nghĩa luôn trả láng giềng gần nhất trong hồ sơ của chính người hỏi (đã đo, không đặt được ngưỡng điểm, xem `docs/TRI_TUE.md`).

## [2.4.0] - 2026-11-16

### Added
- AI điền form từ chứng từ: trên trang Gửi hồ sơ, bấm "AI điền từ chứng từ" cạnh tệp PDF hoặc ảnh; trạm extractor đọc chữ (pdftotext hoặc OCR), trợ lý AI gợi ý giá trị cho từng trường, ô do AI điền có nhãn nhắc kiểm tra. Đường mới `POST /fill?app=` không lưu tệp, không tạo hồ sơ; chữ gửi AI đã che số điện thoại, email, CCCD, số thẻ; cổng API giới hạn 10 lượt/phút. Kiểm thử đơn vị `fill.test.js`.
- Biểu đồ mạng nhện H-P-D-I và đường xu hướng 4 tuần trên trang Số liệu (SVG, không thư viện); khi chưa đủ lịch sử thì ghi rõ thay vì vẽ biểu đồ trống.

### Changed
- Giao diện ứng dụng theo kiểu phần mềm doanh nghiệp: nền phẳng, bỏ chuyển sắc và khung chào trang trí, chữ 14px, thẻ bo góc nhỏ không đổ bóng, trang rộng hơn; thanh bên một màu, mục điều hướng gom theo bốn không gian H, P, D, I.
- Bản đồ cảm biến viết lại: chiếu đúng tỉ lệ (hiệu chỉnh vĩ độ), lưới theo km, thanh tỉ lệ, hướng bắc, hàng số liệu tổng; cảm biến vượt ngưỡng là tam giác có quầng nhấp nháy (tôn trọng giảm chuyển động), danh sách bên cạnh làm nổi điểm tương ứng.
- Sơ đồ quy trình: nút rộng hơn, chữ to hơn, tên bước ít bị cắt.
- Tài liệu: thêm `/fill` vào bảng tuyến của `docs/KY_THUAT.md`; `docs/TRI_TUE.md` ghi rõ mọi tính năng AI đổi sang Ollama chỉ bằng ba biến môi trường.

## [2.3.2] - 2026-11-16

### Fixed
- Ca ORG-09 thử lại khi kiểm chứng sổ cái: ca COLD-03 chạy song song tạm sửa một tệp của tổ chức mặc định nên có lúc ORG-09 thấy lỗi giả. Chỉ sửa kiểm thử, mã sản phẩm không đổi.

## [2.3.1] - 2026-11-16

### Fixed
- Ca T1-SSO-10 in thêm nội dung trang Keycloak khi nhân viên không đăng nhập thẳng được, để tìm nguyên nhân lỗi chỉ xảy ra trên nhánh main.

## [2.3.0] - 2026-11-16

### Changed
- Trang giới thiệu dự án thiết kế lại bằng bộ công cụ Impeccable: bỏ chữ chuyển sắc, ánh sáng viền, biểu tượng emoji và lưới thẻ giống nhau; chuyển sang thế giới giấy tờ văn phòng (nền giấy, chữ serif, mực xanh), bảng kẻ các bước, bảng bằng chứng gắn với ca kiểm thử, con dấu "ĐÃ DUYỆT" đóng lên ảnh chụp. Bộ dò của Impeccable không báo lỗi nào.

### Added
- `PRODUCT.md`: bối cảnh sản phẩm, người dùng, thế giới thị giác và ràng buộc cho các lần thiết kế sau.

## [2.2.0] - 2026-11-16

### Changed
- Trang web giới thiệu dự án (GitHub Pages) viết lại thành một trang tự chứa `docs/index.html`: nền động, ảnh giao diện nghiêng 3D, số liệu đếm lên, thẻ tính năng, sơ đồ kiến trúc, thư viện ảnh, mục nói thẳng và hướng dẫn chạy thử. Thay `docs/index.md`.

## [2.1.0] - 2026-11-16

### Changed
- Giao diện: khối chào có số liệu nhanh ở Bàn làm việc, nền chuyển sắc, thanh điều hướng chuyển sắc, thẻ có đổ bóng, hiệu ứng vào trang (tắt khi người dùng chọn giảm chuyển động).
- README: phần đầu có tiêu đề, khẩu hiệu, lối tắt và bảng điểm nổi bật.

## [2.0.0] - 2026-11-16

Bản đóng băng nộp bài: gom các đợt 1.10.0 đến 1.14.0 và rà soát cuối; không đổi tính năng so với 1.14.0.

### Added
- `docs/NOP_BAI.md`: hướng dẫn nộp bài và danh sách kiểm tra trước hạn.
- Bước 6 và 7 của `scripts/demo-platform.mjs`: chữ ký số X.509 và NGSI-LD kèm vị trí.

### Changed
- Slide, kịch bản demo và báo cáo đối chiếu cập nhật theo tính năng thật (PKI phần mềm, NGSI-LD, DuckDB, OCR, quản trị tổ chức); số ca kiểm thử trên slide là 180+.
- Tuyến API đọc (`/signatures`, `/pki`, `/ngsi-ld`, `/orgs`) tách khỏi giới hạn 60 lần/phút của tuyến dữ liệu, tăng lên 300.

## [1.14.0] - 2026-11-16

### Added
- Quản trị người dùng của tổ chức: màn hình "Người dùng tổ chức" và `GET/POST /orgs/users`, khóa/mở lại tài khoản; giám đốc chỉ quản trị được tổ chức của mình (Keycloak Admin API).
- `scripts/org-create.mjs`: lập tổ chức mới kèm giám đốc đầu tiên.
- BI theo tổ chức: vai trò CSDL `bi_<tổ chức>` chỉ đọc view báo cáo của tổ chức đó (`08-tenant.sql`).
- Ca ORG-12..16 và UPG-01 (đường nâng cấp CSDL từ 1.8.2).

### Changed
- Xuất bản ứng dụng cấp quyền view báo cáo cho vai trò BI của tổ chức sở hữu.
- Tài liệu nâng cấp: áp 05..08, biến Keycloak cho bridge, phần Keycloak làm tay.

## [1.13.0] - 2026-11-16

### Added
- Không gian [I]: trạm `extractor` (poppler, Tesseract OCR tiếng Việt + Anh) đọc chữ từ PDF và ảnh vào chỉ mục tìm kiếm (profile `search`).
- Tìm ngữ nghĩa tùy chọn bằng Meilisearch lai: đặt `SEARCH_EMBEDDER`, tỉ lệ `SEARCH_SEMANTIC_RATIO`.
- Ca I-SEARCH-06 (PDF, ảnh, PDF quét), I-SEARCH-07 (ngữ nghĩa); tiện ích tạo PDF thử bằng mã.

### Changed
- Tìm kiếm quét nhiều trang kết quả (tối đa 1000) cho đến khi đủ kết quả người hỏi được xem, thay vì chỉ trang đầu 100 kết quả.
- I-07 không còn `todo`; copyleft poppler thêm vào THIRD_PARTY.

## [1.12.0] - 2026-11-16

### Added
- Không gian dữ liệu [D]: vị trí cảm biến (`lat`, `lon`), đầu ra NGSI-LD chỉ đọc (`GET /ngsi-ld/v1/entities`), trang "Bản đồ cảm biến" (SVG, không phụ thuộc thêm).
- SQL trên kho lạnh bằng DuckDB: `scripts/cold-sql.sh`, dịch vụ `lakehouse` (profile `lakehouse`).
- Ca IOT-08, COLD-05, LAKE-01; migration `07-geo.sql`; DuckDB và Python vào THIRD_PARTY.

### Fixed
- Tệp JSONL của kho lạnh có dòng bị ngắt khi hồ sơ có từ hai sự kiện (`json_agg` chèn xuống dòng): nay dùng `jsonb_agg`.

### Changed
- D-06 vẫn `todo` nhưng chỉ còn phần Parquet/Iceberg, NGSI-LD ghi và nền bản đồ.

## [1.11.0] - 2026-11-16

### Added
- Sao lưu tự động theo lịch: dịch vụ `backup` (profile `backup`, mặc định 24 giờ, giữ 7 bản); `restore.sh` khôi phục được từ bản chỉ có CSDL.
- GitOps nhẹ: `scripts/gitops.sh check|apply|watch`.
- Khóa theo cảm biến: số đo vượt ngưỡng đến cùng lúc không còn mở nhiều hồ sơ sửa chữa (IOT-07).
- Ca kiểm thử OPS-BACKUP, OPS-GITOPS, IOT-07.

### Changed
- Z-08 không còn `todo`; Z-10 ghi rõ phần GitOps nhẹ đã có.

## [1.10.0] - 2026-11-16

### Added
- Chữ ký số PKI phần mềm cho phê duyệt: CA riêng từng tổ chức, chứng thư X.509 cho người ký, mỗi duyệt/từ chối được ký RSA-SHA256 và lưu ở `event_signature` (chỉ thêm); khóa riêng mã hóa AES-256-GCM.
- `GET /signatures/verify`, `GET /pki/ca` qua cổng API; mục "Chữ ký số" trên trang hồ sơ; biến `PKI_MASTER_KEY`.
- Bộ kiểm thử `tests/pki.test.js` (PKI-01..07) và kiểm thử đơn vị `pki.test.js`; migration `06-pki.sql`.

### Changed
- Z-07 không còn là `todo`; giới hạn còn lại (HSM, CRL/OCSP, ký phía máy chủ) ghi trong tài liệu.

## [1.9.1] - 2026-11-16

### Added
- Workflow `packages.yml` tự tạo bản phát hành GitHub kèm `.tar.gz` khi gắn thẻ phiên bản (trước đây tạo thủ công); chạy lại được bằng `workflow_dispatch`.
- Hai ca `todo` trung thực: Z-10 (GitOps thật), Z-11 (gom nhật ký truy vết phân tán, trục sự kiện streaming).

### Fixed
- Hai liên kết trong tài liệu trỏ ra ngoài thư mục `docs/` bị 404 trên trang web (nay trỏ tới GitHub).

### Verified
- Slide trên trang GitHub Pages vừa khít màn hình 1280x720 (15 slide), mọi trang tài liệu trên Pages mở được.
- Áp `05-org.sql` lên CSDL có dữ liệu cũ: dòng cũ thành tổ chức mặc định, chạy lại không lỗi.

## [1.9.0] - 2026-11-15

### Added
- `scripts/demo-platform.mjs`: trình diễn nền tảng Tầng 1 trong hai phút (cảm biến mở hồ sơ sửa chữa, kho lạnh và kiểm chứng sổ cái, phả hệ, cách ly đa tổ chức, cổng API chặn token giả), không cần mở giao diện.
- Ba ca `todo` trung thực trong `tests/hpdi.test.js`: Z-07 (PKI), Z-08 (sao lưu theo lịch), Z-09 (WebSocket, MQTT).

### Changed
- Slide và kịch bản trình diễn 15 phút sắp lại theo đúng bốn nội dung Đề quy định (giải pháp và công nghệ; tính năng nền tảng và bài toán minh họa; kết quả và demo; định hướng). Trước đây nền tảng Tầng 1 và bốn nguyên lý chỉ chiếm vài phút cuối; nay chiếm mục 1, mục 2 và một cảnh demo riêng.
- Câu trả lời thường gặp của ban giám khảo cập nhật theo các tính năng mới (két bí mật, WAF, ẩn thông tin cá nhân, đa tổ chức đã có; PKI chưa).
- Trang web GitHub Pages cho dự án (`docs/_config.yml`, `docs/index.md`).

## [1.8.4] - 2026-11-15

### Added
- **Đa tổ chức (multi-tenancy)**: nhiều tổ chức dùng chung một hệ thống, cách ly bằng `org_id` ở CSDL và Hasura. Bảng `org`, cột `org_id` ở `app`, `submission`, `sensor`, `cold_archive`; hồ sơ luôn mang `org_id` của quy trình nhận nó (trigger). `infra/postgres/init/05-org.sql` chạy lại được trên CSDL đang dùng.
- Token mang claim `org_id` (Keycloak: thuộc tính người dùng cùng mapper), Hasura đọc thành `x-hasura-org-id` (mặc định `default`). Mọi quyền đọc, ghi của 4 vai trò đều thêm điều kiện tổ chức; thêm quan hệ `app` cho `app_version`, `app_change`, `app_issue`, `step_autonomy`.
- Kho lạnh mỗi tổ chức một chuỗi sổ cái riêng và thư mục riêng trong kho S3; cảm biến và ứng dụng sửa chữa gắn với tổ chức của giám đốc đăng ký; việc xuất kho hằng ngày chạy cho từng tổ chức.
- Tổ chức B để thử cách ly: `staffb1`, `managerb1`, `directorb1`. Giao diện hiện tên tổ chức cạnh vai trò.
- Bộ kiểm thử `tests/tenant.test.js` (ORG-01..11) và kiểm thử đơn vị cho `orgOf`.

### Changed
- `GET /archive`, `/archive/verify`, `POST /archive`, `GET /sensors` chỉ trả dữ liệu của tổ chức người gọi.
- Realm Keycloak khai báo thuộc tính `org_id` trong user profile (Keycloak 26 bỏ thuộc tính chưa khai báo).
- `tests/cold.test.js` COLD-03 chọn tệp của tổ chức mặc định (có thêm tổ chức B).

## [1.8.3] - 2026-11-15

### Changed
- README viết lại: chạy thử đặt lên đầu, thêm tóm tắt tiếng Anh, gom phần tính năng, bỏ các bảng trùng với tài liệu (bảng điểm vào của cổng API chuyển sang `docs/KY_THUAT.md`), nói thẳng các điểm chưa làm.

### Fixed
- `tests/cold.test.js` COLD-01: không còn giả định không có hồ sơ khác kết thúc cùng lúc (các tệp kiểm thử chạy song song).

## [1.8.2] - 2026-11-15

### Added
- **Hội tụ IT/OT** (nguyên lý (ii) của Đề): `POST /sensors` đăng ký cảm biến (giám đốc), `POST /telemetry/<mã>` nhận số đo bằng token thiết bị, `GET /sensors` là bản sao số. Số đo vượt ngưỡng tự mở hồ sơ sửa chữa đi qua quy trình duyệt của người; không mở trùng khi còn hồ sơ đang chạy. Bảng mới `infra/postgres/init/04-iot.sql`; mẫu `library/iot/sua_chua.json`.
- Bộ kiểm thử `tests/iot.test.js` (IOT-01..06) và kiểm thử đơn vị `sensors.test.js`.

### Changed
- `services/workflow-bridge/db.js`: hàm chạy SQL dùng chung (kho lạnh và cảm biến); giá trị NULL trả về `null` thay vì chuỗi "NULL".

## [1.8.1] - 2026-11-15

### Added
- **Kho dữ liệu lạnh** (nguyên lý (i) của Đề): hồ sơ đã kết thúc xuất ra JSONL trong bucket `dxlab-cold`; sổ cái `cold_archive` băm nối chuỗi, bất biến ở tầng CSDL; `POST /archive`, `GET /archive`, `GET /archive/verify` (chỉ giám đốc); tự chạy mỗi ngày. Bảng mới trong `infra/postgres/init/03-cold.sql` (đang chạy thì áp tệp này bằng psql, hoặc `docker compose down -v` rồi dựng lại).
- **Phả hệ dữ liệu** (nguyên lý (iii)): `GET /lineage` lấy tự động từ danh mục PostgreSQL.
- **Nạp hàng loạt**: `POST /ingest?app=<mã>` nhận CSV hoặc mảng JSON tối đa 500 dòng; từng dòng đi bằng token người nạp.
- Bộ kiểm thử `tests/cold.test.js` (COLD-01..04, LIN-01, ING-01..02) và kiểm thử đơn vị cho `cold.js`, `ingest.js`.

## [1.8.0] - 2026-11-15

### Added
- **Thời gian thực** (Z-03, WF-05): `GET /events` (SSE) qua cổng API; bridge đẩy nhịp mỗi khi hồ sơ, nhật ký, ứng dụng hay tệp đổi. Mọi màn hình dùng chung một kênh (`web/src/live.js`); kênh đứt thì tự hỏi định kỳ.
- **Đo tài nguyên** (RISK-03): `scripts/measure.sh` và ca OPS-08 (bản lõi dưới 5 GiB RAM, đo khoảng 3 GiB).
- Mục "Đối chiếu lần cuối với Đề thi" trong `docs/KIEM_THU.md` (RISK-01), nói thẳng phần chưa có: kho lạnh, IT/OT, phả hệ, chứng thư số.

### Changed
- Số lần hỏi máy chủ giảm rõ rệt: có kênh sống thì mỗi màn hình chỉ hỏi bù 30 giây một lần thay vì 3 đến 5 giây.

## [1.7.9] - 2026-11-15

### Added
- **Tường lửa ứng dụng web** (Z-02): Coraza + OWASP CRS đứng trước cổng API (profile `waf`, cổng 9081). SQL injection, XSS, đi ngược thư mục bị 403.
- **Két bí mật OpenBao** (Z-01): `scripts/vault.sh init|unseal|export|up`; mật khẩu, khóa, token chuyển từ `.env` vào két (profile `vault`).
- **Ẩn thông tin cá nhân** (Z-04): email, số điện thoại, CCCD, số thẻ bị thay bằng nhãn trước khi gửi tới máy chủ AI (`services/workflow-bridge/pii.js`).
- Ba ca Z-01, Z-02, Z-04 chuyển từ `todo` thành ca chạy thật; CI chạy chúng cùng các thành phần tùy chọn.

## [1.7.8] - 2026-11-15

### Security
- Kho đối tượng S3 (SeaweedFS) nay **bắt buộc xác thực AWS Signature V4**: yêu cầu không ký hoặc ký sai bị `403`. Khóa truy cập đặt trong `.env` (`S3_ACCESS_KEY`, `S3_SECRET_KEY`), chỉ cầu nối có khóa. Bộ ký `services/workflow-bridge/s3.js` dùng thư viện chuẩn của Node, kiểm chứng bằng ví dụ chính thức của AWS. Đóng DA-05 (#94).
- Ca kiểm thử mới T1-OBJ-09: không ký, ký sai bị 403; ký đúng đọc/ghi được.

## [1.7.7] - 2026-11-15

### Changed
- Các màn hình còn lại (Số liệu, Gửi hồ sơ, Trợ lý AI, Tài liệu, Soạn quy trình) dùng đủ hai ngôn ngữ Việt và Anh; đóng giai đoạn 2 của #111. Thời lượng ("2 giờ", "1,5 ngày"), bốn nấc tự chủ của trợ lý và tên nhóm hồ sơ cũng đổi theo ngôn ngữ.
- `web/src/hardcoded.test.js` nay chặn chữ Việt viết thẳng ở mọi màn hình, `lib.js` và `metrics.js`. Dòng là dữ liệu (giá trị nhóm lưu trong cơ sở dữ liệu) đánh dấu `i18n-ok`.

## [1.7.6] - 2026-11-15

### Added
- Dưới mỗi thẻ điểm H, P, D, I trên trang Số liệu có dòng "Việc đáng làm nhất": thành phần cộng được nhiều điểm nhất kèm việc cụ thể (`nextStep` trong `maturity.js`).
- Bảng xu hướng 4 tuần cho H và D, tính lại từ nhật ký tại từng mốc (`weeklyTrend`). P và I không có lịch sử nên không vẽ, và trang nói rõ điều đó.

## [1.7.5] - 2026-11-15

### Added
- Mục "Gợi ý cải tiến quy trình" trên trang Số liệu: bước chờ trung bình quá 48 giờ hoặc bị từ chối từ 40% (ít nhất 3 hồ sơ) được nêu cùng con số căn cứ, kèm cảnh báo vai trò chưa từng ký hồ sơ nào. Tính từ dữ liệu thật, không dùng AI (`web/src/hints.js`, có kiểm thử).
- Bàn làm việc đánh nhãn "Quá N giờ" cho hồ sơ chờ người xem quá 48 giờ.

## [1.7.4] - 2026-11-15

### Added
- Bàn làm việc của giám đốc báo "N bước duyệt đã đủ bằng chứng để nâng nấc tự chủ của trợ lý AI" kèm liên kết tới trang Trợ lý AI. Luật bằng chứng (10 quyết định thật, 90% khớp) dùng chung một mô-đun `web/src/autonomy.js` có kiểm thử; cơ sở dữ liệu vẫn là nơi chặn thật (`autonomy_guard`).
- Trang Số liệu (giám đốc) hiện độ khớp chung giữa trợ lý AI và người, hoặc hướng dẫn bắt đầu thu bằng chứng khi chưa có.

### Changed
- Trang Trợ lý AI dùng chung mô-đun bằng chứng thay vì bản sao trong trang.

## [1.7.3] - 2026-11-15

### Added
- Trang Số liệu có mục "Nhật ký và xuất dữ liệu": liệt kê hồ sơ đã xong nhưng thiếu nhật ký (có liên kết), và nút tải CSV hoặc JSON toàn bộ hồ sơ kèm nhật ký. Dữ liệu xuất chỉ gồm những gì người dùng được phép xem; CSV chặn công thức bảng tính.
- `web/src/exporter.js` và `incompleteLogs` trong `maturity.js`, có kiểm thử đơn vị. CI chạy toàn bộ `web/src/*.test.js` (trước đó bỏ sót flow, maturity, hardcoded).

## [1.7.2] - 2026-11-15

### Added
- Mọi dịch vụ chạy lâu có `restart: unless-stopped` và kiểm tra sức khỏe (trước đó chỉ 3 trong 9 dịch vụ có restart). Ca kiểm OPS-06 (cấu hình) và OPS-07 (cho tiến trình thoát đột ngột, Docker phải tự chạy lại).
- Dữ liệu mẫu có một vòng cải tiến quy trình thật: "Xin tạm ứng" lên phiên bản 2 qua đề xuất được giám đốc chấp nhận, một đề xuất khác bị từ chối.
- `tests/demo.check.js` và bước CI tương ứng: sau khi nạp dữ liệu mẫu, điểm H-P-D-I của các quy trình mẫu phải hợp lý.
- Trang Số liệu ghi rõ điểm tính từ bao nhiêu hồ sơ và quy trình.

### Fixed
- Trưởng phòng và giám đốc xem được mọi hồ sơ nhưng chỉ thấy nhật ký do chính họ ký (quyền đọc `submission_event`), nên trang Số liệu và điểm trưởng thành tính thiếu sự kiện: D "hồ sơ có nhật ký đủ" luôn 0%. Hai vai trò này nay đọc được toàn bộ nhật ký của hồ sơ họ được xem; người không liên quan vẫn không thấy. Ca kiểm D-04b.
- Điểm trưởng thành thấp (D, I gần 0) trên máy dev lâu ngày là do hàng trăm quy trình do bộ kiểm thử tạo ra lẫn vào mẫu số. Máy demo dựng sạch bằng `scripts/demo-reset.sh` cho điểm đúng; ghi chú trong KICH_BAN_DEMO.

## [1.7.1] - 2026-11-15

### Changed
- Bàn làm việc, Hồ sơ, Quy trình, hàng ô ký và hộp duyệt/từ chối dùng đủ hai ngôn ngữ Việt và Anh (#111, giai đoạn 1). Ngày giờ, số, thời gian tương đối và tên vai trò đổi theo ngôn ngữ đang chọn.

### Added
- Ca kiểm `web/src/hardcoded.test.js`: màn hình đã chuyển sang i18n mà còn chữ Việt viết thẳng thì kiểm thử đỏ.

## [1.7.0] - 2026-11-15

### Added
- Sơ đồ quy trình (`ProcessFlow.vue`, SVG, không thư viện ngoài) trong trang hồ sơ và trang Quy trình: bước đang chờ sáng lên, bước đã ký, bị từ chối hoặc bỏ qua (nét đứt kèm đường vòng) có trạng thái bằng chữ và ký hiệu chứ không chỉ màu; hồ sơ chuyển bước thì sơ đồ đổi theo ở lần cập nhật kế tiếp.
- Mức trưởng thành H-P-D-I (điểm 0 đến 100 cho từng không gian) ở trang Số liệu, tính từ dữ liệu thật, công thức công bố ở `docs/HUONG_DAN.md`; dưới 5 hồ sơ thì báo chưa đủ dữ liệu.
- `scripts/demo-reset.sh`: dựng lại hệ thống sạch và nạp dữ liệu mẫu cho mỗi lần diễn tập.
- Kiểm thử đơn vị `flow.test.js`, `maturity.test.js`.

### Changed
- Trạng thái từng bước tách thành `web/src/flow.js`, dùng chung cho hàng ô ký và sơ đồ.
- Dữ liệu mẫu có thêm 2 hồ sơ "Xin tạm ứng" (tổng 11) để số liệu của quy trình này đủ mẫu.

## [1.6.4] - 2026-11-15

### Fixed
- Chạy kiểm thử trên bản giải nén từ tarball (không có thư mục `.git`): các ca cần lịch sử commit hoặc thẻ (LUAT-02, 03, 05, PoF-1.2, 3.2, 3.4, 6.2) tự bỏ qua kèm lý do thay vì báo đỏ; `pof.test.js` không còn sập khi nạp.

## [1.6.3] - 2026-11-15

### Fixed
- Tìm kiếm: chỉ đánh dấu tài liệu là đã nạp sau khi Meilisearch xử lý xong tác vụ; tác vụ lỗi thì báo và lần sau thử lại (trước đây lỗi âm thầm, tài liệu không bao giờ được nạp lại).
- Tìm kiếm: hai lần nạp không còn chạy chồng nhau; tệp không phải dạng chữ chỉ xét một lần; tệp đọc lỗi chỉ thử tối đa 3 lần thay vì mỗi 10 giây mãi.

## [1.6.2] - 2026-11-15

### Fixed
- Ca PoF-1.3 không còn bị kẹt trong CI khi lần chạy trước trên `main` đang đỏ: trong CI chỉ đòi từng có lần chạy xanh gần đây, chạy cục bộ vẫn đòi lần gần nhất phải xanh.

## [1.6.1] - 2026-11-15

### Fixed
- Tìm kiếm: chỉ mục đôi khi được tạo không có khóa chính (hai bước tạo chỉ mục và đặt cấu hình chạy đua nhau), khiến Meilisearch từ chối ngầm mọi lần nạp tài liệu và ca I-SEARCH chập chờn trên CI. Nay chỉ định khóa chính ngay ở lệnh nạp.
- Tìm kiếm: chỉ mục bị mất thì tự dựng lại và nạp lại; một tệp đọc lỗi không còn chặn cả lần nạp; mọi lời gọi Hasura và S3 có hạn chờ; nhật ký ghi rõ mã lỗi.

## [1.6.0] - 2026-11-15

Tài liệu và trình diễn.

### Added
- `docs/HUONG_DAN.md`: hướng dẫn người dùng theo bốn không gian H/P/D/I.
- `docs/KY_THUAT.md`: sổ tay kỹ thuật và vận hành (dịch vụ, khởi động, cấu hình, dữ liệu nằm đâu, bảng sự cố thường gặp).
- `docs/KICH_BAN_DEMO.md`: kịch bản trình diễn 15 phút theo từng cảnh, danh sách chuẩn bị, câu hỏi thường gặp của ban giám khảo, xử lý sự cố trên sân khấu.
- `docs/slides/index.html`: slide 12 trang, một tệp HTML không thư viện ngoài.
- Ca kiểm thử LUAT-12: tài liệu có đủ, README dẫn tới, liên kết không gãy.

### Changed
- `docs/architecture.md` và README cập nhật theo hiện trạng (quét mã độc, MFA, TLS, giám sát, hỏi đáp có kiểm quyền, Kanban, lịch, vi/en); phần "Thử trong 3 phút" dùng đúng tên màn hình hiện tại; mục Định hướng phát triển và các việc gắn nhãn `good first issue`.

## [1.5.0] - 2026-11-15

Không gian [I]: hỏi đáp tài liệu có dẫn nguồn và kiểm quyền.

### Added
- **Hỏi đáp tài liệu** (`/hoi-dap`, `POST /ask`) và **tìm kiếm toàn văn** (`POST /search`) trên hồ sơ và tệp đính kèm dạng văn bản, bằng Meilisearch (profile `search`). Mỗi kết quả được Hasura kiểm lại bằng token của người hỏi, nên người không có quyền không bao giờ thấy nội dung, cả trong kết quả lẫn trong ngữ cảnh gửi cho AI. AI chỉ trả lời từ các đoạn tìm được, dẫn số nguồn.
- **Ollama** (profile `ai`) để chạy mô hình AI tại chỗ; hướng dẫn trong `docs/TRI_TUE.md`.
- Ca kiểm thử `tests/search.test.js` (I-SEARCH-01..05), kiểm thử đơn vị `search.test.js` và `snippet.test.js`.

### Chưa làm
- Tìm kiếm véc-tơ ngữ nghĩa (Qdrant), đọc PDF và OCR, vòng hỏi-đáp làm rõ khi AI sinh quy trình (GEN-10).

## [1.4.0] - 2026-11-15

An toàn và vận hành.

### Added
- **MFA**: trưởng phòng và giám đốc phải nhập OTP (TOTP) sau mật khẩu; nhân viên và kế toán chỉ cần mật khẩu (luồng `browser-mfa` của Keycloak, ca T1-SSO-10 đi qua trang đăng nhập thật).
- **Sao lưu và khôi phục**: `scripts/backup.sh`, `scripts/restore.sh` (ba cơ sở dữ liệu và kho tệp, kiểm mã băm trước khi ghi đè), ca `tests/restore.test.js` chạy trọn vòng trên hệ thống thật.
- **TLS tại biên** bằng Caddy và **giám sát** bằng Prometheus (số đo của cổng API), tách trong `docker-compose.optional.yml` với profile `tls` và `monitoring`; bản lõi không đổi.
- `docs/VAN_HANH.md`: hướng dẫn vận hành, `tests/ops.test.js`.

### Changed
- Keycloak tin header `X-Forwarded-*` để chạy sau proxy TLS.
- Ca Z-05 và Z-06 từ "todo" thành ca có kiểm chứng.

### Chưa làm
- Két bí mật (OpenBao), WAF, ẩn thông tin định danh (PII), sao lưu tự động theo lịch, Grafana (giấy phép AGPL-3.0, trái chính sách của dự án).

## [1.3.0] - 2026-11-15

Không gian [H] Con người số hoàn thiện hơn và giao diện nói rõ kiến trúc H-P-D-I.

### Added
- **Bảng công việc** (`/bang`): hồ sơ xếp cột Kanban theo tình trạng, cột "Chờ bạn" là việc riêng của người đăng nhập.
- **Lịch** (`/lich`): lưới tháng, hồ sơ theo ngày gửi và ngày hoàn tất.
- **Trang cá nhân và trung tâm thông báo** (`/ca-nhan`): thông tin, số hồ sơ, thông báo suy ra từ hồ sơ thật.
- Nhãn không gian **H / P / D / I** cạnh từng mục điều hướng.
- Đa ngôn ngữ **vi/en** không thêm thư viện (`web/src/i18n.js`): khung điều hướng và ba trang mới đã dịch; các trang cũ còn tiếng Việt.
- **ESLint** (`npm run lint`) chạy trong CI trước khi dựng frontend; kiểm thử đơn vị bộ khoá dịch.

### Changed
- Ca kiểm thử H-03 từ "todo" thành ca thật.

### Chưa làm
- Thông báo vẫn lấy bằng hỏi lại mỗi 4 giây, chưa phải Hasura subscription (gateway chưa nhận token qua WebSocket).

## [1.2.1] - 2026-11-15

Bản rà soát đúng luật: kiểm các điều khoản của Thể lệ và Đề thi ngoài bảng điểm PoF, và chuẩn bị hồ sơ nộp bài.

### Added
- `tests/luat.test.js` (LUAT-01 đến LUAT-11): kho công khai và nhận diện giấy phép, không tài liệu của BTC trong kho, lịch sử commit và danh sách người đóng góp không có công cụ/bot, không bí mật trong toàn bộ lịch sử, image container công khai, bản phát hành có ghi chú, Tầng 1 không giao diện, dựng bằng một lệnh, hồ sơ nộp bài.
- `docs/NOP_BAI.md`: câu hỏi hạn nộp gửi BTC, danh sách điều kiện đội, mẫu thư nộp bài đúng quy cách, danh sách kiểm tra trước khi gửi.

### Changed
- `docs/KIEM_THU.md` bổ sung nhóm LUAT, kết quả cài sạch từ bản phát hành và quét bí mật.

## [1.2.0] - 2026-11-15

### Added
- **GitHub Packages**: mỗi thẻ phiên bản tự động phát hành hai image lên `ghcr.io` (`dxlab-web`, `dxlab-workflow-bridge`) kèm nhãn nguồn và giấy phép; thêm `services/workflow-bridge/Dockerfile`. Cài từ mã nguồn bằng `docker compose` vẫn là cách chuẩn.

## [1.1.0] - 2026-11-15

Bản kiểm thử theo tiêu chuẩn: thay smoke test bằng bộ kiểm thử đối chiếu trực tiếp với đề thi và thể lệ, và vá các lỗi mà bộ kiểm thử tìm ra.

### Added
- Bộ kiểm thử `tests/` chạy trên hệ thống thật: Tầng 1 (SSO, cổng API, headless, dữ liệu cấu trúc và phi cấu trúc, luồng BPMN), không gian H-P-D-I (kể cả tấn công vào bộ sinh ứng dụng và gọi AI thật) và sáu tiêu chí PoF của thể lệ (kho, giấy phép, bản phát hành, dựng từ bản phát hành, thư viện đính kèm, tài liệu). Báo cáo: `docs/KIEM_THU.md`.
- **Trạm kiểm dịch mã độc ClamAV**: mọi tệp tải lên được quét trước khi lưu; tệp nhiễm bị từ chối (422), trạm hỏng thì từ chối luôn (503) thay vì cho qua.
- Chống dò mật khẩu ở Keycloak (khóa tạm thời sau 8 lần sai).
- Tiêu đề bảo mật cho ứng dụng web (CSP, chống nhúng khung, nosniff, Referrer-Policy, Permissions-Policy).
- Mẫu pull request, mẫu đề xuất tính năng, `CODE_OF_CONDUCT.md`.

### Security
- Nhật ký hành động trên hồ sơ **bất biến ở tầng cơ sở dữ liệu**: không UPDATE, DELETE hay TRUNCATE được, kể cả bằng quyền chủ sở hữu.
- Từ chối hồ sơ bắt buộc có lý do ở cơ sở dữ liệu, không chỉ ở giao diện (trước đây gọi thẳng API vẫn từ chối được không lý do).

### Changed
- CI chạy bộ kiểm thử thật thay cho smoke test; `scripts/smoke.sh` bị xóa.
- Kiểm tra phiên bản phát hành chấp nhận phiên bản mới hơn trên nhánh đang làm (thẻ được gắn sau khi gộp).

## [1.0.0] - 2026-11-15

Bản ổn định đầu tiên: quy trình như mã nguồn mở, giao diện làm lại, tệp đính kèm, số liệu và trợ lý AI "thử việc".

### Added
- **Trợ lý AI "thử việc"**: mỗi bước duyệt có bốn nấc tự chủ (người làm, chạy bóng, gợi ý, tự duyệt). Trợ lý cho ý kiến kèm lý do dựa trên hồ sơ và các quyết định gần đây của người ở bước đó; ở nấc 3 người duyệt thấy gợi ý, ở nấc 4 trợ lý tự duyệt hồ sơ hợp lệ còn từ chối luôn do người quyết.
- Nâng nấc bị cơ sở dữ liệu chặn nếu thiếu bằng chứng: chỉ giám đốc, từng nấc một, cần ≥ 10 quyết định thật của người và ≥ 90% khớp; dữ liệu mẫu không được tính. Hạ nấc ai có quyền cũng làm được.
- Trang "Trợ lý AI" cho trưởng phòng và giám đốc: nấc hiện tại, bằng chứng khớp, nâng/hạ nấc, các lần gần đây trợ lý so với người.
- `seed.js --ai-demo`: chạy bóng trợ lý trên 12 hồ sơ có người quyết định thật.

### Added (đã phát hành trước đó trong nhánh chính)
- **Tệp đính kèm hồ sơ** lưu trong kho S3 (SeaweedFS), đi qua cổng API; quyền xem/đính kèm theo đúng quyền của hồ sơ; tải về luôn dạng tệp đính kèm. Chọn tệp ngay trong form gửi hồ sơ hoặc thêm ở trang hồ sơ (tối đa 10 MB).
- Trang **Tài liệu** (không gian [H]): mọi tệp tôi được xem, có tìm kiếm.
- Trang **Số liệu** (không gian [D]) cho trưởng phòng và giám đốc: số hồ sơ, thời gian xử lý trung bình, tỷ lệ duyệt, bước chậm nhất, hồ sơ chờ lâu nhất; tính từ dữ liệu thật bằng mã có kiểm thử.
- Dữ liệu mẫu có thời gian dàn ra nhiều ngày để số liệu có ý nghĩa.

### Security
- Chỉ còn ba cổng mở ra máy chủ (web, cổng API, đăng nhập); Hasura, Flowable, kho S3 chỉ trong mạng nội bộ; tắt console Hasura; Keycloak chạy chế độ production.
- Ứng dụng web không còn được đăng nhập bằng mật khẩu trực tiếp; việc đó chuyển sang client riêng `dxlab-cli` cho smoke test và nạp dữ liệu mẫu.
- Quản lý và giám đốc xem được mọi hồ sơ để điều hành; các vai trò khác vẫn chỉ thấy hồ sơ liên quan tới mình.

### Changed
- Giấy phép các thành phần được đối chiếu với kho chính thức và đánh dấu đã xác minh trong `THIRD_PARTY.md`, kèm kết luận về tương thích.
- Tài liệu gửi giảng viên được cập nhật cho khớp công nghệ thực tế.

### Removed
- Các bảng `project`, `task`, `document` chưa được dùng (tệp đính kèm thay cho `document`).

### Changed
- **Làm lại toàn bộ giao diện theo hướng "bàn giấy văn phòng"**: màu mực bút bi xanh, con dấu đỏ khi duyệt, giấy nhớ cho lời nhắn của trợ lý; Be Vietnam Pro cho chữ, Noto Serif cho tên văn bản và chữ ký; biểu tượng Lucide.
- Trang chủ "Bàn làm việc" có lời chào, tóm tắt việc hôm nay, việc chờ bạn xử lý (duyệt ngay tại chỗ) và lối tắt gửi hồ sơ.
- Mỗi hồ sơ có số ("hồ sơ số 27") và trang riêng: nội dung, hàng ô ký (ai đã ký, ai đang chờ, bước nào không cần), nhật ký kể bằng câu.
- Từ chối hồ sơ bắt buộc ghi lý do để người gửi biết phải sửa gì.
- Soạn quy trình thành 3 bước dẫn dắt (bắt đầu, soạn, xuất bản); quy trình có mô tả ngắn và nhóm.
- Thanh điều hướng dưới đáy trên điện thoại; thông báo ngắn sau mỗi hành động; lời báo lỗi nói rõ cách khắc phục.

### Added
- **Quy trình là mã nguồn mở**: mỗi quy trình có lịch sử phiên bản bất biến kèm ghi chú thay đổi; sửa một quy trình đang chạy phải mở *đề xuất thay đổi*, được kiểm tra tự động, chạy thử trên các hồ sơ đã có (bao nhiêu hồ sơ đổi đường đi, thời gian chờ ước tính), và phải do người khác (giám đốc) chấp nhận mới phát hành.
- Trang "Quy trình": xem sơ đồ, so sánh thay đổi bằng lời thường, lịch sử phiên bản, góp ý và báo lỗi quy trình — mọi vai trò đều xem được.
- Bắt đầu từ kho quy trình mẫu ngay trong trang "Tạo ứng dụng"; tải quy trình đang soạn thành tệp JSON đúng định dạng `library/` để đóng góp lại.
- Hồ sơ ghi nhận phiên bản quy trình lúc gửi và hiển thị theo đúng phiên bản đó; nhật ký ghi tên người thực hiện.

### Changed
- Trưởng phòng không còn sửa thẳng được quy trình đã xuất bản (chỉ tạo mới hoặc mở đề xuất).

## [0.1.0] - 2026-11-14

Bản phát hành đầu tiên: nền tảng lõi chạy được từ đầu đến cuối và bộ sinh ứng dụng quy trình.

### Added
- Kho quy trình mẫu `library/` (tạm ứng, nghỉ phép, mua thiết bị, đề nghị thanh toán) và lệnh nạp dữ liệu mẫu cho bản demo.
- Khung dự án: LICENSE (Apache-2.0), README, CONTRIBUTING, THIRD_PARTY, CI, mẫu Issue/PR.
- Docker Compose khung tầng 1: PostgreSQL, Keycloak, Hasura, APISIX, lưu trữ đối tượng S3.
- **Bộ sinh ứng dụng quy trình**: quản lý khai báo một "bản mô tả ứng dụng" (các trường dữ liệu + các bước xử lý theo vai trò, có điều kiện); hệ thống tự biên dịch thành quy trình BPMN trên Flowable và view dữ liệu phẳng cho BI, không cần viết mã.
- **Ứng dụng web** (Vue 3, `web/`): đăng nhập SSO; trang "Tạo ứng dụng" (mô tả bằng lời → AI phác thảo → chỉnh sửa → xem sơ đồ → xuất bản); form gửi hồ sơ tự sinh từ bản mô tả; hộp việc theo vai trò với sơ đồ quy trình hiển thị bước đang chờ, bước đã qua, bước bị bỏ qua.
- Không ai được tự xử lý hồ sơ do chính mình gửi.
- **Trợ lý AI** (tùy chọn): mô tả quy trình bằng tiếng Việt → bản mô tả ứng dụng kèm câu hỏi làm rõ, để con người xem lại trước khi xuất bản. Dùng mọi máy chủ tương thích OpenAI (Ollama, vLLM, Mistral...).
- Rào chắn dữ liệu tại cơ sở dữ liệu: hồ sơ gửi vào phải khớp kiểu và trường bắt buộc đã khai báo.
- Nhật ký hành động chỉ-thêm trên từng hồ sơ; vai trò `director`, `accountant` và tài khoản mẫu tương ứng.
- Schema không gian [H] (project, task, document) và phân quyền theo dòng trong Hasura.
- Realm Keycloak `dxlab`: client `dxlab-app` (PKCE) và tài khoản mẫu; Hasura xác thực JWT bằng JWKS của Keycloak.
- Flowable REST 7.2.0 làm động cơ quy trình; dịch vụ `workflow-bridge` biên dịch ứng dụng và nối sự kiện Hasura với Flowable.
- Gateway kiểm tra JWT của Keycloak ngay tại biên (thiếu token trả 401), có CORS và giới hạn tần suất cho `/v1/graphql`.
- Smoke test `scripts/smoke.sh` chạy trong CI: đăng nhập → gateway → định nghĩa ứng dụng → 3 nhánh quy trình → phân quyền → view BI.

### Changed
- Thay MinIO bằng SeaweedFS 4.53 (Apache-2.0) vì image MinIO cộng đồng không còn trên Docker Hub.
