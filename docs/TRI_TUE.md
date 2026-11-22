<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->

# Không gian [I]: tìm kiếm, hỏi đáp có dẫn nguồn và AI chạy tại chỗ

## Hỏi đáp tài liệu (RAG có kiểm quyền)

Bật Meilisearch (thành phần tùy chọn, không có trong bản lõi):

```bash
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile search up -d
```

Cách hoạt động:

1. `workflow-bridge` nạp vào chỉ mục (mỗi 10 giây, chỉ phần mới hoặc đổi) nội dung các ô của hồ sơ, ghi chú duyệt và **tệp đính kèm dạng văn bản** (`.txt`, `.md`, `.csv`, `.json`, `.log`... tới 1 MB).
2. Người dùng hỏi ở trang **Hỏi đáp tài liệu** (`/hoi-dap`) hoặc gọi `POST /search` và `POST /ask` qua cổng API (có JWT, giới hạn 120 yêu cầu mỗi phút).
3. Meilisearch tìm đoạn khớp, rồi **Hasura kiểm lại từng kết quả bằng chính token của người hỏi**. Chỉ mục không quyết định quyền, nên hồ sơ người đó không được xem không bao giờ xuất hiện, cả trong kết quả lẫn trong ngữ cảnh gửi cho AI.
4. Nếu đã cấu hình AI (`AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` trong `.env`), AI trả lời **chỉ dựa trên các đoạn đó**, mỗi ý ghi số nguồn. Nguồn được coi là dữ liệu, không phải mệnh lệnh. Không có đoạn nào khớp thì không gọi AI. Không cấu hình AI thì vẫn tìm kiếm và xem nguồn được.

**PDF và ảnh (OCR).** Cùng profile `search` còn dựng trạm `extractor` (chỉ mạng nội bộ): PDF có lớp chữ đọc bằng poppler `pdftotext`; PDF quét và ảnh PNG/JPEG/TIFF/BMP/GIF đọc bằng Tesseract (tiếng Việt + Anh), tối đa 10 trang, mỗi tệp tối đa 10 MB. Chữ đọc được đi vào chỉ mục như tệp văn bản và chịu cùng kiểm quyền.

**Chia đoạn.** Tệp dài được cắt thành các đoạn khoảng 450 ký tự, chồng nhau một ít, mỗi đoạn là một tài liệu trong chỉ mục; khi trả kết quả, mỗi tệp chỉ hiện đoạn khớp nhất (`distinctAttribute`). Nhờ vậy đoạn trích và ngữ cảnh gửi cho AI đúng chỗ cần, và mô hình nhúng (chỉ đọc khoảng 128 token) không bỏ sót phần sau của tệp.

**Tìm ngữ nghĩa (khuyên dùng: profile `vector`).** Bật thêm profile `vector` và đặt hai biến trong `.env`:

```sh
VECTOR_URL=http://qdrant:6333
EMBED_URL=http://embedder
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile search --profile vector up -d
```

Qdrant (Apache-2.0) lưu véc-tơ, dịch vụ nhúng Text Embeddings Inference (Apache-2.0, bản CPU) chạy bản lượng tử int8 chính thức của `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2` (Apache-2.0, đa ngữ có tiếng Việt, 384 chiều, tệp 118 MB, cần CPU có AVX2), chỉ cần CPU, không cần GPU. Container `embedder-model` tải mô hình một lần từ đúng một commit và kiểm sha256 từng tệp, vì dịch vụ nhúng tự tải chỉ lấy được bản fp32; Meilisearch chỉ còn lo từ khóa. `workflow-bridge` hỏi hai bên song song rồi trộn: mỗi tệp lấy điểm cao hơn của hai bên (`SEARCH_SEMANTIC_RATIO`, mặc định 0.5), sau đó Hasura kiểm quyền như cũ. Không dùng Ollama nên không tranh tài nguyên với mô hình ngôn ngữ. Mô hình mặc định không cần tiền tố; mô hình nào cần thì đặt `EMBED_QUERY_PREFIX`/`EMBED_DOC_PREFIX`, đổi mô hình không phải sửa mã (mỗi lần khởi động, `workflow-bridge` dựng lại kho véc-tơ và nhúng lại toàn bộ, nên đổi mô hình chỉ cần khởi động lại; dịch vụ nhúng chưa sẵn sàng thì kho cũ vẫn được giữ để tìm). Dịch vụ nhúng hay Qdrant chết: tìm kiếm tự lùi về từ khóa (câu đầu chờ tối đa 3 giây, sau đó 30 giây không gọi lại), phần từ khóa vẫn nạp đủ, phần véc-tơ được nạp bù khi dịch vụ sống lại.

Tài liệu mới tải lên được lập chỉ mục tự động: cứ 10 giây `workflow-bridge` lấy tệp mới từ SeaweedFS, đọc chữ (PDF/ảnh qua extractor), chia đoạn, nhúng rồi ghi vào Qdrant. Đã thử đầu-cuối với SeaweedFS, extractor, dịch vụ nhúng, Qdrant và Meilisearch thật: tệp .txt mới tìm được bằng câu diễn đạt khác (không trùng từ khóa) sau 6,8 giây, PDF mới sau 9,3 giây; tệp tải lên lúc dịch vụ nhúng chết vẫn tìm được theo từ khóa và vào Qdrant 2 giây sau khi dịch vụ sống lại.

**Số đo** (`node scripts/eval-search.mjs qua-bridge`, chạy đúng mã bridge kể cả kiểm quyền; ThinkPad E470 4 lõi, chỉ CPU, không GPU, Docker Desktop 2,7 GB RAM; kho 312 tài liệu gồm 12 tài liệu đích và 300 tài liệu nhiễu cùng loại; 39 câu hỏi tiếng Việt chia 5 nhóm; ngày 22/11/2026). Ô ghi "đúng hạng 1 / đúng trong 3 kết quả đầu":

| Nhóm câu hỏi | Chỉ từ khóa | **MiniLM int8 (mặc định)** | MiniLM fp32 | gte-multilingual-base |
|---|---|---|---|---|
| Diễn đạt khác chữ (15) | 5 / 6 | 10 / 10 | 10 / 10 | 15 / 15 |
| Tra đúng mã, số, tên (8) | 8 / 8 | 8 / 8 | 8 / 8 | 8 / 8 |
| Gõ không dấu (6) | 6 / 6 | 6 / 6 | 6 / 6 | 6 / 6 |
| Gõ sai chính tả (6) | 5 / 5 | 5 / 5 | 5 / 5 | 6 / 6 |
| Thông tin nằm sâu trong tệp dài (4) | 4 / 4 | 4 / 4 | 4 / 4 | 4 / 4 |
| **Tổng (39)** | 28 / 29 | **33 / 33** | 33 / 33 | 39 / 39 |
| Nạp 312 hồ sơ | 2 s | 15 s | 18 s | 170 s |
| p50 / p95, 8 người tìm cùng lúc, câu chưa hỏi lần nào | 176 ms (p95) | 151 / 210 ms | 199 / 395 ms | 1,0 / 1,7 s |
| RAM dịch vụ nhúng (đỉnh) | 0 | **480 MB** | 960 MB | 1,56 GB |

Qdrant thêm khoảng 130 MB và Meilisearch khoảng 110 MB, nên cả phần tìm ngữ nghĩa mặc định cần khoảng 0,7 GB. Bản int8 cho đúng các câu như bản fp32 (chạy hai lần đều 33/39) với nửa RAM. gte-multilingual-base (Apache-2.0) đúng cả 39 câu nhưng nặng gấp ba và nạp chậm gấp mười (1.000 hồ sơ khoảng 9 phút, mỗi lần khởi động lại đều nhúng lại), p95 khi đông người gần 2 giây, sát ngưỡng 3 giây mà bridge bỏ phần ngữ nghĩa; chỉ nên dùng khi máy chủ dư RAM và CPU, bằng cách đặt `EMBED_MODEL=Alibaba-NLP/gte-multilingual-base` và `EMBED_REVISION=9bbca17d9273fd0d03d5725c7a4b0f6b45142062`.

Trộn theo thứ hạng (RRF) và cộng điểm chuẩn hóa đều kém hơn khi đo, nên chỉ giữ cách lấy điểm cao hơn. Dịch vụ nhúng chạy với `--max-batch-tokens 2048 --tokenization-workers 1` (giảm khoảng một phần ba RAM, độ đúng không đổi).

**Trường hợp xấu đã thử** (chế độ `bao-mat` với Qdrant + MiniLM fp32, chạy đúng mã của `workflow-bridge`): tìm đúng 8/8 trường hợp gồm mã nằm cuối tệp 100.000 ký tự, tệp dày emoji, bảng CSV, tài liệu tiếng Anh tìm bằng câu tiếng Việt, câu hỏi dài 400 ký tự; đầu vào xấu (dấu nháy, toán tử, `' OR 1=1 --`, 500 ký tự có dấu…) không gây lỗi 5xx; các vai người dùng không thấy hồ sơ nào ngoài quyền, kể cả khi dịch vụ nhúng chết và hệ thống lùi về từ khóa.

**Tìm ngữ nghĩa không thêm container.** Đặt `SEARCH_EMBEDDER=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2@e8f8c211226b894fcb81acc59f3b34ba3efd5f42` trong `.env` (tên mô hình, ghim phiên bản bằng `@mã-commit`) rồi dựng lại `workflow-bridge`: Meilisearch tự nhúng văn bản bằng mô hình HuggingFace chạy ngay trong nó, **không thêm container nào**. Mô hình tải khoảng 470 MB lần đầu vào volume `meilimodels`, cần mạng lúc đó. Cách này cũng đạt 33/39 đúng hạng 1 trên cùng bộ câu hỏi (p95 605 ms khi 8 người tìm cùng lúc, RAM Meilisearch ~950 MB). Nhờ đó "laptop cho bộ phận tài chính" tìm ra "máy tính xách tay cho phòng kế toán". Chưa tải được mô hình thì tìm kiếm tự lùi về từ khóa thay vì báo lỗi. Kết quả vẫn qua Hasura kiểm quyền, và vì tìm ngữ nghĩa luôn trả về láng giềng gần nhất nên hệ thống quét từng trang kết quả (tối đa 1000) cho đến khi đủ phần người hỏi được xem. Để Meilisearch không bị tắt vì hết bộ nhớ khi nạp tệp lớn, compose đặt `MEILI_MAX_INDEXING_THREADS=2` và `MEILI_MAX_INDEXING_MEMORY=512 MiB`.

**Cấu hình tối thiểu cho Meilisearch khi bật tìm ngữ nghĩa:** 1,2 GB RAM và 2 lõi CPU. Tìm từ khóa thì chỉ cần khoảng 100 MB.

**Nâng từ Meilisearch 1.11.** Bản 1.57 không mở được dữ liệu của 1.11: xóa volume chỉ mục (`docker volume rm <tên-dự-án>_meilidata`) rồi bật lại; `workflow-bridge` tự nạp lại mọi thứ từ Hasura trong vài giây (lâu hơn nếu có nhiều PDF/ảnh cần OCR).

Giới hạn hiện tại, nói thẳng: câu hỏi lạc đề vẫn nhận được kết quả "gần nhất" và không đặt được ngưỡng lọc: với MiniLM int8, câu lạc đề hay mã không tồn tại đạt cosine tới 0,40 trong khi tài liệu đúng có khi chỉ 0,07–0,26 (nhất là câu gõ không dấu, vốn đã được từ khóa tìm đúng), đo bằng `node scripts/eval-search.mjs nguong`; vì vậy người hỏi có thể thấy hồ sơ "gần nhất" của chính mình, không bao giờ thấy hồ sơ ngoài quyền; tìm ngữ nghĩa mặc định tắt, mô hình nhỏ nên độ chính xác vừa phải và điểm xếp hạng không tách bạch tài liệu liên quan khỏi không liên quan; OCR chỉ đọc 10 trang đầu và phụ thuộc chất lượng ảnh. Kiểm thử: `SEARCH_OPTIONAL=1 node --test tests/search.test.js`.

## Mô hình AI chạy tại chỗ (Ollama)

Để dữ liệu không rời máy chủ, có thể chạy mô hình ngôn ngữ ngay trong Docker:

```bash
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile ai up -d
docker compose -f docker-compose.yml -f docker-compose.optional.yml exec ollama ollama pull qwen2.5:7b
```

Rồi đặt trong `.env`: `AI_BASE_URL=http://ollama:11434/v1`, `AI_MODEL=qwen2.5:7b`, `AI_API_KEY=ollama`, và dựng lại `workflow-bridge`. Mô hình 7 tỷ tham số cần khoảng 8 GB RAM; máy yếu hãy dùng dịch vụ ngoài như Mistral. Thành phần này chưa được kiểm thử tự động trong CI vì tải mô hình quá nặng.

Mọi tính năng AI (soạn quy trình, hỏi đáp, ý kiến chạy bóng, AI điền form từ chứng từ ở `/fill`) cùng đọc `AI_BASE_URL`, nên đổi từ Mistral sang Ollama chỉ là đổi ba biến này, không sửa mã. Chứng từ đã được che số điện thoại, email, CCCD, số thẻ trước khi gửi ra ngoài; chạy Ollama thì chữ không rời máy chủ.

## Báo trước khi đủ bằng chứng

Bàn làm việc của giám đốc hiện dòng "N bước duyệt đã đủ bằng chứng để nâng nấc" khi một bước ở nấc 2 trở lên đạt 10 quyết định thật và 90% khớp. Trang Số liệu cho giám đốc thấy độ khớp chung. Việc nâng nấc vẫn do giám đốc bấm; cơ sở dữ liệu chặn nếu thiếu bằng chứng.
