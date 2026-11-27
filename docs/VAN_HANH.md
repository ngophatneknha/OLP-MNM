<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Vận hành: sao lưu, TLS, giám sát, MFA

## Sao lưu và khôi phục

Sao lưu ba cơ sở dữ liệu (`dxlab`, `keycloak`, `flowable`) và kho tệp SeaweedFS, kèm tệp mã băm `SHA256SUMS`. Chạy khi hệ thống đang hoạt động:

```bash
sh scripts/backup.sh                 # vào backups/<ngày-giờ>
sh scripts/backup.sh /duong/dan/khac
```

Khôi phục **ghi đè** dữ liệu hiện tại: kiểm mã băm, dừng các dịch vụ dùng dữ liệu, dựng lại ba cơ sở dữ liệu, trả kho tệp về, rồi bật lại toàn bộ.

```bash
sh scripts/restore.sh backups/20261115-101500
node tests/wait-ready.js
```

**Sao lưu tự động theo lịch:** bật dịch vụ `backup` (mặc định mỗi 24 giờ, giữ 7 bản mới nhất trong `backups/`, đổi bằng `BACKUP_INTERVAL_HOURS`, `BACKUP_KEEP`):

```bash
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile backup up -d
```

Bản tự động chỉ gồm ba cơ sở dữ liệu (kèm `SHA256SUMS`); `restore.sh` khôi phục được từ nó và giữ nguyên kho tệp. Cần cả kho tệp thì chạy `scripts/backup.sh`. Nên chép thư mục `backups/` sang máy khác. Giới hạn: kho tệp được nén khi đang chạy, cần ảnh chụp nhất quán tuyệt đối thì dừng `seaweedfs` trước. Bộ kiểm thử `tests/restore.test.js` chạy trọn vòng sao lưu, phá dữ liệu, khôi phục trên hệ thống thật:

```bash
RESTORE_TEST=1 node --test tests/restore.test.js   # phá và khôi phục dữ liệu thật, không chạy cùng bộ khác
```

## GitOps nhẹ

Cấu hình hạ tầng (compose, Hasura, cổng API, Keycloak) là mã trong kho; `scripts/gitops.sh` giữ máy chạy khớp với kho:

```bash
sh scripts/gitops.sh check        # kiểm cấu hình trong kho hợp lệ, không đổi gì
sh scripts/gitops.sh apply        # lấy bản mới (chỉ tiến), kiểm, rồi `up -d --build` và nạp lại metadata Hasura
sh scripts/gitops.sh watch 300    # lặp lại apply mỗi 300 giây
```

Giới hạn: không phải ArgoCD/Flux (một máy, không tự hoàn tác); nhánh cục bộ lệch khỏi `origin` thì `apply` dừng thay vì ghi đè.

## TLS tại biên (Caddy)

Thành phần tùy chọn nằm trong `docker-compose.optional.yml`, tách khỏi bản lõi để máy yếu vẫn chạy được:

```bash
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile tls up -d
```

Caddy mở ba địa chỉ HTTPS với chứng chỉ nội bộ (trình duyệt cảnh báo cho tới khi tin CA của Caddy): web `https://localhost:8443`, API `https://localhost:9443`, đăng nhập `https://localhost:8444`. Để dùng ứng dụng qua HTTPS, đặt trong `.env` rồi dựng lại:

```
KEYCLOAK_PUBLIC_URL=https://localhost:8444
API_PUBLIC_URL=https://localhost:9443
APP_ORIGIN=https://localhost:8443
```

Triển khai thật: đổi `localhost` trong `infra/caddy/Caddyfile` thành tên miền, Caddy sẽ tự lấy chứng chỉ Let's Encrypt.

## Tường lửa ứng dụng (Coraza)

```bash
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile waf up -d --build
```

Coraza (WAF mã nguồn mở, Apache-2.0) chạy trong Caddy cùng bộ luật OWASP CRS, đứng trước cổng API tại `http://localhost:9081` (đổi bằng `WAF_PORT`). Dùng 9081 thay cho 9080 là mọi yêu cầu được kiểm tra trước: SQL injection, XSS, đi ngược thư mục bị trả `403`. Lần dựng đầu mất vài phút vì biên dịch Caddy kèm Coraza. Nếu một chức năng bị chặn nhầm, đọc nhật ký bằng `docker compose logs waf` rồi thêm luật loại trừ trong `infra/coraza/Caddyfile`.

## Két bí mật (OpenBao)

```bash
sh scripts/vault.sh init     # khởi tạo két, chép mật khẩu/khóa/token trong .env vào két
sh scripts/vault.sh up       # chạy hệ thống với bí mật lấy từ két
```

Sau `init`, khóa mở và token gốc nằm ở `.vault-keys` (không commit). **Hãy cất tệp này ra ngoài máy chủ rồi xóa**, sau đó xóa các dòng bí mật trong `.env`. Két khởi động lại sẽ bị khóa: `sh scripts/vault.sh unseal` (cần tệp khóa). Giới hạn: một khóa mở duy nhất, chưa tự mở khóa; môi trường thật nên chia khóa cho nhiều người.

## Cảm biến (IT/OT)

1. Xuất bản ứng dụng sửa chữa: nhập mẫu `library/iot/sua_chua.json` bằng Soạn quy trình (cần các trường `thiet_bi`, `cam_bien`, `gia_tri`, `mo_ta`).
2. Giám đốc đăng ký cảm biến, ví dụ bằng `curl` với token đăng nhập:

```bash
curl -X POST "$API/sensors" -H "authorization: Bearer $TOKEN" -H "x-hasura-role: director" -H "content-type: application/json"   -d '{"key":"lanh_kho1","name":"Tủ lạnh kho 1","unit":"°C","threshold":8,"direction":"above","repair_app":"sua_chua"}'
```

Phản hồi có `token` (chỉ hiện một lần): cất vào thiết bị. 3. Thiết bị gửi số đo:

```bash
curl -X POST "$API/telemetry/lanh_kho1" -H "x-sensor-token: $DEVICE_TOKEN" -H "content-type: application/json" -d '{"value": 11.5}'
```

Có thể gửi mảng tới 100 số đo kèm `at` (ISO 8601, trong 7 ngày qua). Vượt ngưỡng thì hồ sơ sửa chữa tự mở và hiện ở trưởng phòng. Token đi qua HTTP thường nên môi trường thật cần bật TLS. Máy đang chạy cần áp `infra/postgres/init/04-iot.sql` bằng psql (hoặc dựng lại CSDL).

### Vị trí, NGSI-LD và bản đồ

Đăng ký cảm biến có thể kèm `"lat": 10.8231, "lon": 106.6297` (WGS84, cả hai hoặc không có). Bản đồ nằm ở mục "Bản đồ cảm biến" (trưởng phòng, giám đốc): chấm xanh bình thường, chấm đỏ vượt ngưỡng. Hệ thống ngoài đọc theo chuẩn NGSI-LD (kiểu `Device`, `Property`, `GeoProperty`, `observedAt`):

```bash
curl "$API/ngsi-ld/v1/entities?type=Device" -H "authorization: Bearer $TOKEN" -H "x-hasura-role: manager"
```

Ghi và theo dõi theo chuẩn (giám đốc):

```bash
# Tạo Device; thân phản hồi có deviceToken một lần (dùng cho /telemetry)
curl -X POST "$API/ngsi-ld/v1/entities" -H "authorization: Bearer $TOKEN" -H "x-hasura-role: director" -H "content-type: application/ld+json" \
  -d '{"id":"urn:ngsi-ld:Device:default:tu_dong_1","type":"Device","name":{"type":"Property","value":"Tủ đông 1"},"threshold":{"type":"Property","value":8,"unitCode":"CEL"},"direction":{"type":"Property","value":"above"},"repairApp":{"type":"Property","value":"sua_chua"},"location":{"type":"GeoProperty","value":{"type":"Point","coordinates":[105.85,21.03]}}}'
# Cập nhật số đo
curl -X PATCH "$API/ngsi-ld/v1/entities/urn:ngsi-ld:Device:default:tu_dong_1/attrs" ... -d '{"value":{"type":"Property","value":9.5}}'
# Thuê bao: vượt 8 độ thì POST Notification tới máy của đối tác (phải có trong NGSI_NOTIFY_ALLOW, dạng máy:cổng)
curl -X POST "$API/ngsi-ld/v1/subscriptions" ... -d '{"type":"Subscription","entities":[{"type":"Device"}],"q":"value>8","throttling":60,"notification":{"endpoint":{"uri":"https://doi-tac.example/ngsi"}}}'
```

`GET /ngsi-ld/v1/subscriptions/<id>` cho biết `timesSent`, `lastSuccess`, `lastFailure`, `lastErrorReason`. Máy đang chạy cần áp `infra/postgres/init/09-ngsi.sql`.

Nền bản đồ là ranh giới 34 tỉnh, thành từ 01/7/2025 (Nghị quyết 202/2025/QH15) và quần đảo Hoàng Sa, Trường Sa (`web/public/basemap-vn.json`, 48 KB, dựng lại bằng `node scripts/basemap.mjs` từ Natural Earth 1:10m v5.1.2, public domain), nằm ngay trong ứng dụng nên không tải gì từ bên ngoài.

Giới hạn (shortcut): NGSI-LD là tập con của chuẩn (một kiểu `Device`, chỉ ghi `value`, `q` gồm so sánh nối bằng `;`, gửi thông báo một lần không thử lại); nền bản đồ chỉ tới mức tỉnh (Natural Earth còn vẽ 63 tỉnh cũ, `scripts/basemap.mjs` gộp lại theo bảng `MERGE`; tỉnh gộp nguyên vẹn nên ranh giới tỉnh mới đúng, chưa có ranh giới xã mới); thêm cột vị trí vào CSDL đang chạy: `docker compose exec -T postgres psql -U dxlab -d dxlab < infra/postgres/init/07-geo.sql`.

## SQL trên kho lạnh (DuckDB)

DuckDB đọc trực tiếp các tệp JSONL trong S3, không cần nạp lại vào PostgreSQL. Lần đầu dựng một ảnh nhỏ (Python và DuckDB):

```bash
sh scripts/cold-sql.sh "SELECT org, status, count(*) AS n FROM cold GROUP BY ALL"
sh scripts/cold-sql.sh "SELECT app_key, avg(date_diff('hour', created_at, finished_at)) AS gio FROM cold GROUP BY ALL"
```

Bảng ảo `cold` có mọi cột của hồ sơ, thêm `org`, `object_key`, `events`. Tệp hỏng hoặc bị sửa bị bỏ qua và báo ở stderr (kiểm chứng sửa đổi dùng `GET /archive/verify`). Giới hạn (shortcut): đọc thẳng tệp JSONL, không có lược đồ phiên bản (dùng bảng Iceberg bên dưới); chạy bằng quyền vận hành (không theo token người dùng) nên chỉ người vận hành dùng.

## Bảng Iceberg của kho lạnh

Apache Iceberg là lớp "mục lục" đặt trên các tệp Parquet: biết bảng gồm tệp nào, lược đồ đang ở phiên bản mấy, và giữ ảnh chụp (snapshot) để đọc lại dữ liệu tại một thời điểm. `scripts/lake.sh` (cùng ảnh với `cold-sql.sh`, thêm PyIceberg) nạp các tệp JSONL của kho lạnh vào bảng `cold.submission`: tệp Parquet nằm trong `dxlab-cold/lake/`, danh mục nằm trong PostgreSQL (bảng `iceberg_tables`), phân vùng theo tổ chức.

```bash
sh scripts/lake.sh sync                     # nạp tệp mới; chạy lại không nhân đôi; in số tệp, cột mới, tệp bị bỏ qua
sh scripts/lake.sh info                     # phiên bản lược đồ, ảnh chụp
sh scripts/lake.sh sql "SELECT org, app_key, count(*) AS n, sum(data_so_tien) AS tong FROM lake GROUP BY ALL"
sh scripts/lake.sh sql "SELECT count(*) FROM lake" <snapshot_id>   # đọc lại ảnh chụp cũ
```

Mỗi trường của hồ sơ thành cột `data_<mã>` (số là `double`, đúng/sai là `boolean`, còn lại là chuỗi); trường mới thì thêm cột và lược đồ lên phiên bản. Tệp có giá trị trái kiểu cột đã có, hoặc tệp hỏng, bị bỏ qua cả tệp và báo lý do. Giới hạn (shortcut): một tiến trình ghi tại một thời điểm, chưa gộp tệp nhỏ hay xóa ảnh chụp cũ; chạy bằng quyền vận hành.

## Nhật ký tập trung và mã truy vết

```bash
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile logs up -d
curl http://127.0.0.1:9428/select/logsql/query -d 'query=request_id:"<mã trong tiêu đề X-Request-Id của phản hồi>"'
curl http://127.0.0.1:9428/select/logsql/query -d 'query=service:workflow-bridge AND status:500'
```

Cổng APISIX gắn mã `X-Request-Id` cho mọi yêu cầu (giữ mã do bên gọi gửi), chuyển xuống workflow-bridge và trả lại trong phản hồi; cả hai ghi nhật ký truy cập JSON một dòng có mã này, không ghi chuỗi truy vấn hay token. Vector đọc nhật ký mọi container của dự án qua Docker API, che email, số điện thoại, CCCD, số thẻ, rồi gửi vào VictoriaLogs (giữ `LOGS_RETENTION`, mặc định 14 ngày). Giao diện tìm kiếm: http://127.0.0.1:9428/select/vmui (chỉ mở trên máy chủ). Lưu ý bảo mật: Vector cần socket Docker (gắn chỉ đọc) và nhờ đó thấy mọi container trên máy, nên chỉ bật trên máy chủ do đội vận hành quản lý. Giới hạn (shortcut): một máy; truy vết bằng mã chung chứ chưa có span OpenTelemetry.

## Trục sự kiện (NATS JetStream)

```bash
NATS_URL=nats://nats:4222 docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile stream up -d
```

Mỗi lần duyệt, từ chối hay xác nhận hồ sơ (bảng `submission_event`) được phát lên chủ đề `dx.<tổ chức>.submission.<approve|reject|done>` của stream `DX` (lưu đĩa, giữ 30 ngày). Mẫu outbox: bridge đọc bảng theo mốc `stream_cursor`, phát kèm `Nats-Msg-Id` (JetStream bỏ tin trùng), có xác nhận mới dời mốc; NATS tắt thì việc duyệt vẫn chạy và tin được phát bù khi NATS sống lại. Tin không chứa dữ liệu biểu mẫu hay tên người. Dịch vụ khác nghe bằng bất kỳ thư viện NATS nào với `NATS_TOKEN`, qua cổng `127.0.0.1:4222`. Máy đang chạy cần áp `infra/postgres/init/10-stream.sql`. Giới hạn (shortcut): một token cho cả hệ thống (chưa tách quyền theo tổ chức), chưa TLS tới NATS (cùng mạng nội bộ Docker); cần giao thức Kafka thì thay bộ phát, không đổi thiết kế outbox.

## Giám sát (Prometheus)

```bash
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile monitoring up -d
```

Prometheus thu số đo của cổng API (APISIX) mỗi 15 giây, giao diện truy vấn ở `http://localhost:9092` (đổi cổng bằng `PROMETHEUS_PORT`). Ví dụ truy vấn: `sum by (code) (rate(apisix_http_status[1m]))`. Chưa dùng Grafana vì giấy phép AGPL-3.0, trái chính sách của dự án.

## Xác thực nhiều yếu tố (MFA)

Tài khoản có vai trò **Trưởng phòng** hoặc **Giám đốc** phải nhập mã OTP (TOTP, ứng dụng như FreeOTP hay Google Authenticator) sau mật khẩu khi đăng nhập qua trình duyệt; lần đầu họ được hướng dẫn quét mã QR để thiết lập. Nhân viên và kế toán chỉ cần mật khẩu. Luồng khai báo trong `infra/keycloak/realm/dxlab-realm.json` (luồng `browser-mfa`), kiểm thử bằng ca T1-SSO-10.

Lưu ý: client dòng lệnh `dxlab-cli` dùng cấp quyền bằng mật khẩu chỉ để kiểm thử, không đi qua luồng trình duyệt nên không bị MFA chặn; không dùng nó ngoài môi trường phát triển.

## Nhiều tổ chức

Mỗi người dùng thuộc đúng một tổ chức, ghi bằng thuộc tính `org_id` của tài khoản Keycloak (đi vào token thành claim `org_id`; thiếu thì là `default`). Hasura thêm điều kiện `org_id` vào mọi quyền đọc và ghi, nên cách ly nằm ở CSDL chứ không ở giao diện.

**Lập tổ chức mới** (việc của người vận hành): thêm tổ chức và giám đốc đầu tiên của nó trong một lệnh. Dòng `org` mới tự có vai trò BI `bi_<mã>`.

```bash
node scripts/org-create.mjs congtyc "Công ty C" giamdoc.c matkhau-tam-1
```

**Giám đốc quản trị người dùng của tổ chức mình** ở mục "Người dùng tổ chức" trên web (hoặc `GET/POST /orgs/users`, `POST /orgs/users/<id>/disable|enable`): thêm người với vai trò nhân viên, trưởng phòng, kế toán hay giám đốc, khóa và mở lại tài khoản. Người mới luôn thuộc tổ chức của người gọi (máy chủ lấy `org_id` từ token, bỏ qua mọi giá trị người gọi gửi lên); mật khẩu tạm buộc đổi ở lần đăng nhập đầu. Bridge gọi Keycloak Admin API bằng tài khoản `KEYCLOAK_ADMIN` trong `.env` (shortcut: nên đổi sang client dịch vụ chỉ có quyền quản lý người dùng). Trưởng phòng và giám đốc vẫn phải tự cài OTP ở lần đăng nhập đầu như mọi tài khoản.

**BI theo tổ chức.** Mỗi tổ chức có vai trò CSDL `bi_<mã>` (mặc định không đăng nhập) chỉ đọc được các view `bi.app_*` của ứng dụng thuộc tổ chức đó, không đọc được bảng gốc hay view của tổ chức khác. Cho công cụ BI của tổ chức dùng: `ALTER ROLE "bi_orgb" LOGIN PASSWORD '...'`.

Nâng cấp hệ thống đang chạy (volume cũ): áp tệp SQL, khởi động lại Hasura để nhận cấu hình token mới, và thêm vào Keycloak thuộc tính người dùng `org_id` cùng một "mapper" thuộc tính vào token cho hai client `dxlab-app` và `dxlab-cli` (hoặc nhập lại realm trên Keycloak trống: `dxlab-realm.json` đã khai báo sẵn). Không có claim thì mọi người vẫn ở tổ chức mặc định nên hệ thống cũ chạy như trước. Phần SQL đã được thử trên CSDL có dữ liệu từ trước 1.8.4: dòng cũ nhận `org_id = 'default'`, hồ sơ mới vẫn nhận tổ chức từ quy trình, chạy lại tệp lần hai không lỗi; phần Keycloak thì chưa thử trên realm đã có.

```bash
for f in 05-org 06-pki 07-geo 08-tenant; do docker compose exec -T postgres psql -U dxlab -d dxlab < infra/postgres/init/$f.sql; done
docker compose up -d --build hasura hasura-init workflow-bridge apisix
```

Các tệp chạy lại được. Ca `UPG-01` (tests/upgrade.test.js) dựng một CSDL ở lược đồ cũ có dữ liệu, áp các tệp trên hai lần và kiểm dữ liệu cũ còn nguyên và thuộc tổ chức mặc định. Phần Keycloak không tự động được: realm đã nhập từ trước thiếu thuộc tính và bộ ánh xạ `org_id`, phải thêm tay (hoặc nhập lại realm trên Keycloak trống); thêm biến `KEYCLOAK_ADMIN`, `KEYCLOAK_ADMIN_PASSWORD` cho bridge nếu `docker-compose.yml` của bạn là bản cũ.

Giới hạn nói thẳng: mã ứng dụng (`app.key`) vẫn duy nhất toàn hệ thống (đổi khóa chính của `app` kéo theo sáu bảng, quan hệ Hasura và khóa quy trình Flowable nên chưa làm); chỉ mục Meilisearch dùng chung nhưng mọi kết quả được kiểm quyền qua Hasura; tên đăng nhập duy nhất toàn realm.

## Chữ ký số (PKI)

Mỗi hành động duyệt hoặc từ chối của người được ký bằng chứng thư X.509 (RSA-2048, SHA-256). Mỗi tổ chức có một CA riêng (tự cấp, hiệu lực 10 năm); chứng thư người ký hiệu lực 1 năm và tự cấp khi người đó duyệt lần đầu. Chữ ký nằm ở bảng `event_signature` (chỉ thêm), gồm nội dung được ký (hành động, bước, người, giờ, mã băm dữ liệu hồ sơ), chữ ký và chứng thư.

- Kiểm chứng: trang chi tiết hồ sơ có mục "Chữ ký số"; hoặc `GET /signatures/verify?submission=<id>`; tải chứng thư CA: `GET /pki/ca`.
- Khóa riêng được mã hóa AES-256-GCM (khóa dẫn xuất bằng scrypt từ `PKI_MASTER_KEY`, thiếu thì từ `HASURA_ADMIN_SECRET`) và không mở qua Hasura. **Đổi `PKI_MASTER_KEY` trước khi triển khai thật và không đổi sau khi đã ký**, vì khóa cũ sẽ không giải mã được.
- Nâng cấp CSDL đang chạy: `docker compose exec -T postgres psql -U dxlab -d dxlab < infra/postgres/init/06-pki.sql`, rồi nạp lại metadata Hasura (`docker compose up -d --force-recreate hasura-init`) và khởi động lại bridge, cổng API.
- Giới hạn (shortcut): ký phía máy chủ nên ai kiểm soát máy chủ có thể ký thay; không có HSM, không có CRL/OCSP; CA tự cấp nên không có giá trị pháp lý theo luật chữ ký số.
