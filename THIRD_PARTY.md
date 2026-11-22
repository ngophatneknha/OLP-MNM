<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Thành phần bên thứ ba

Các thành phần chạy dưới dạng **container độc lập, không sửa mã nguồn, không đính kèm mã vào kho này**; chỉ tham chiếu image chính thức với phiên bản cố định trong `docker-compose.yml`. Thư viện của ứng dụng web được cài lúc build bằng `npm ci` theo `web/package-lock.json`, không sao chép vào kho.

**Đã xác minh ngày 15/11/2026** bằng cách đọc tệp giấy phép trong kho chính thức của từng dự án (cột "Nguồn") và, với thư viện npm, trường `license` trong `package.json` của đúng phiên bản đã cài. Mỗi lần nâng phiên bản phải xác minh lại.

## Dịch vụ chạy trong container

| Thành phần | Phiên bản | Giấy phép | Nguồn đã đối chiếu | Đã xác minh |
|---|---|---|---|---|
| PostgreSQL | 16 | PostgreSQL License | `COPYRIGHT` trong github.com/postgres/postgres | ☑ |
| Keycloak | 26.0 | Apache-2.0 | `LICENSE.txt` trong github.com/keycloak/keycloak | ☑ |
| Hasura GraphQL Engine (bản cộng đồng) | v2.40.0 | Apache-2.0 | `LICENSE` trong github.com/hasura/graphql-engine | ☑ |
| Apache APISIX | 3.9.1 | Apache-2.0 | `LICENSE` trong github.com/apache/apisix | ☑ |
| SeaweedFS | 4.53 | Apache-2.0 | `LICENSE` trong github.com/seaweedfs/seaweedfs | ☑ |
| Flowable (REST) | 7.2.0 | Apache-2.0 | `LICENSE` trong github.com/flowable/flowable-engine | ☑ |
| ClamAV (trạm kiểm dịch mã độc) | 1.4.3 | GPL-2.0 | `COPYING.txt` trong github.com/Cisco-Talos/clamav (GitHub báo GPL-2.0) | ☑ |
| Caddy (TLS tại biên, tùy chọn) | 2.8.4 | Apache-2.0 | `LICENSE` trong github.com/caddyserver/caddy | ☑ |
| Coraza + coraza-caddy (tường lửa ứng dụng, tùy chọn) | 2.6.2 | Apache-2.0 | `LICENSE` trong github.com/corazawaf/coraza-caddy | ☑ |
| OWASP Core Rule Set (bộ luật của Coraza, tùy chọn) | đi kèm coraza-caddy | Apache-2.0 | `LICENSE` trong github.com/coreruleset/coreruleset | ☑ |
| OpenBao (két bí mật, tùy chọn) | 2.1.0 | MPL-2.0 | `LICENSE` trong github.com/openbao/openbao | ☑ |
| Meilisearch Community Edition (tìm kiếm toàn văn và ngữ nghĩa, tùy chọn; image `getmeili/meilisearch`) | 1.57.0 | MIT | `LICENSE`, `LICENSE-MIT`, `LICENSE-EE` và `Dockerfile` trong github.com/meilisearch/meilisearch, thẻ v1.57.0 | ☑ |
| Qdrant (kho véc-tơ cho tìm ngữ nghĩa, tùy chọn, profile `vector`; image `qdrant/qdrant`) | 1.20.2 | Apache-2.0 | `LICENSE` trong github.com/qdrant/qdrant | ☑ |
| Text Embeddings Inference (dịch vụ nhúng chạy CPU, tùy chọn, profile `vector`; image `ghcr.io/huggingface/text-embeddings-inference`) | 1.9 (bản cpu) | Apache-2.0 | `LICENSE` trong github.com/huggingface/text-embeddings-inference | ☑ |
| Alpine Linux (tải mô hình nhúng một lần bằng `wget` của BusyBox, tùy chọn, profile `vector`; image `alpine`) | 3.21 | MIT (image), GPL-2.0 (BusyBox) | `LICENSE` trong gitlab.alpinelinux.org/alpine/docker-alpine; `LICENSE` trong busybox.net | ☑ |
| Ollama (mô hình AI chạy tại chỗ, tùy chọn) | 0.5.7 | MIT | `LICENSE` trong github.com/ollama/ollama | ☑ |
| Prometheus (giám sát, tùy chọn) | 2.55.1 | Apache-2.0 | `LICENSE` trong github.com/prometheus/prometheus | ☑ |
| poppler-utils (`pdftotext`, `pdftoppm`; trạm đọc chữ, tùy chọn) | gói Debian của image `python:3.12-slim` | GPL-2.0-or-later | `COPYING` trong gitlab.freedesktop.org/poppler/poppler | ☑ |
| Tesseract OCR (trạm đọc chữ, tùy chọn) | gói Debian của image `python:3.12-slim` | Apache-2.0 | `LICENSE` trong github.com/tesseract-ocr/tesseract (GitHub báo Apache-2.0) | ☑ |
| DuckDB (SQL trên kho lạnh, tùy chọn; gói `duckdb` cài trong ảnh dựng từ `infra/duckdb`) | 1.1.3 | MIT | `LICENSE` trong github.com/duckdb/duckdb (GitHub báo MIT) | ☑ |
| Python (image `python:3.12-slim`, nền của ảnh DuckDB) | 3.12 | PSF-2.0 | `LICENSE` trong github.com/python/cpython | ☑ |
| Node.js (image `node`) | 22.19.0 | MIT | `LICENSE` trong github.com/nodejs/node | ☑ |
| nginx (image phục vụ tệp tĩnh) | 1.28.0 | BSD-2-Clause | `LICENSE` trong github.com/nginx/nginx | ☑ |
| curl (image `curlimages/curl`, nạp cấu hình Hasura) | 8.10.1 | giấy phép curl (kiểu MIT) | `COPYING` trong github.com/curl/curl | ☑ |

Ghi chú:

- Hasura: chỉ dùng tính năng của bản cộng đồng; không bật hay cấu hình tính năng Enterprise nào.
- Meilisearch: từ các bản 1.x gần đây, kho mã chứa thêm phần Enterprise Edition theo BUSL-1.1 (`LICENSE-EE`). Image `getmeili/meilisearch` dựng không kèm phần đó nên là MIT; dự án không dùng image `meilisearch-enterprise` và không dùng tính năng EE (chia shard, snapshot S3). Xác minh ngày 22/11/2026.
- Mô hình nhúng cho tìm ngữ nghĩa (tùy chọn; profile `vector` tải bản int8 `onnx/model_quint8_avx2.onnx` có kiểm sha256, hoặc Meilisearch tự tải khi đặt `SEARCH_EMBEDDER`): `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (Apache-2.0, commit `e8f8c211`). Tùy chọn cho máy chủ mạnh: `Alibaba-NLP/gte-multilingual-base` (Apache-2.0, commit `9bbca17d`). Đã xác minh ngày 22/11/2026 qua trường `cardData.license` của API Hugging Face; mô hình không bị khóa (gated). Phải đối chiếu lại khi đổi mô hình hoặc mã commit. Không dùng mô hình theo điều khoản riêng như Gemma.
- Các image còn chứa gói hệ điều hành nền (Alpine, Debian) với giấy phép riêng của chúng; dự án không sửa và không phân phối lại các gói đó.
- Giấy phép kiểu MIT/BSD của curl, nginx, Node.js tương thích với Apache-2.0 vì các thành phần chỉ được chạy, không trộn mã.

## Thư viện của ứng dụng web

Phiên bản và giấy phép dưới đây lấy từ chính gói đã cài; hai phông chữ được `@fontsource` đóng gói và đi kèm trong tệp tĩnh của ứng dụng.

| Thư viện | Phiên bản | Giấy phép | Vai trò | Đã xác minh |
|---|---|---|---|---|
| Vue | 3.5.45 | MIT | chạy trong trình duyệt | ☑ |
| Vue Router | 5.5.1 | MIT | chạy trong trình duyệt | ☑ |
| keycloak-js | 26.2.5 | Apache-2.0 | chạy trong trình duyệt | ☑ |
| lucide-vue-next (biểu tượng) | 1.0.0 | ISC | chạy trong trình duyệt | ☑ |
| @fontsource/be-vietnam-pro | 5.3.0 | OFL-1.1 | phông chữ đi kèm | ☑ |
| @fontsource/noto-serif | 5.3.0 | OFL-1.1 | phông chữ đi kèm | ☑ |
| Vite, @vitejs/plugin-vue | 8.3.8 / 6.0.11 | MIT | chỉ lúc build | ☑ |
| Tailwind CSS, @tailwindcss/vite | 4.3.5 | MIT | chỉ lúc build | ☑ |
| ESLint, eslint-plugin-vue, globals | 10.15.0 / 10.12.1 / 17.14.0 | MIT | chỉ lúc kiểm tra mã (lint) | ☑ |

Toàn bộ cây phụ thuộc cài lúc build (khoảng 80 gói) chỉ gồm các giấy phép MIT, ISC, BSD-2-Clause, BSD-3-Clause, Apache-2.0, OFL-1.1, BlueOak-1.0.0 và MPL-2.0. Hai gói MPL-2.0 (`lightningcss` và bản nhị phân của nó) là công cụ build của Tailwind: không được đưa vào image cuối, không bị sửa, và MPL-2.0 chỉ ràng buộc chính tệp của gói đó.

## Kết luận về tương thích giấy phép

- Có **ba** thành phần copyleft: ClamAV (GPL-2.0, mạnh), poppler (GPL-2.0 trở lên, mạnh, chỉ nằm trong trạm đọc chữ tùy chọn) và OpenBao (MPL-2.0, yếu, chỉ ràng buộc ở mức tệp và là thành phần tùy chọn). Cả ba chạy trong container riêng, không sửa, không đính kèm mã vào kho, và chỉ giao tiếp với hệ thống qua cổng mạng (giao thức clamd; HTTP của trạm đọc chữ; HTTP API của két). Vì vậy GPL-2.0 không lan sang mã Apache-2.0 của dự án (đây là việc chạy một chương trình riêng, không phải liên kết hay trộn mã). Không thành phần nào dùng AGPL hay giấy phép không được OSI chấp thuận; MinIO (AGPL-3.0) đã được thay bằng SeaweedFS (Apache-2.0), và Grafana (AGPL-3.0) không được dùng: giám sát dùng giao diện truy vấn của Prometheus (Apache-2.0).
- Mã tự viết của dự án phát hành theo Apache-2.0; phông chữ OFL-1.1 được phép đóng gói kèm miễn là không bán riêng, và dự án không làm vậy.
- Dự án không phát hành cùng gói đính kèm của dự án khác và không chỉnh sửa mã của bất kỳ gói nào.

## Tùy chọn

Trợ lý AI là **tùy chọn** và không đính kèm mô hình hay thư viện nào: hệ thống chỉ gọi một địa chỉ HTTP tương thích OpenAI do người triển khai cấu hình (khuyến nghị Ollama, giấy phép MIT, với mô hình trọng số mở chạy nội bộ). Người dùng tự chịu trách nhiệm về giấy phép của mô hình mà họ chọn.

## Không dùng

Các công cụ không phải giấy phép OSI-approved nên bị loại: n8n, Directus, Redpanda, HashiCorp Vault phiên bản BSL.
