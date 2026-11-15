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

Giới hạn hiện tại, nói thẳng: tìm kiếm toàn văn (BM25), chưa có véc-tơ ngữ nghĩa (Qdrant), chưa đọc PDF hay ảnh (OCR). Kiểm thử: `SEARCH_OPTIONAL=1 node --test tests/search.test.js`.

## Mô hình AI chạy tại chỗ (Ollama)

Để dữ liệu không rời máy chủ, có thể chạy mô hình ngôn ngữ ngay trong Docker:

```bash
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile ai up -d
docker compose -f docker-compose.yml -f docker-compose.optional.yml exec ollama ollama pull qwen2.5:7b
```

Rồi đặt trong `.env`: `AI_BASE_URL=http://ollama:11434/v1`, `AI_MODEL=qwen2.5:7b`, `AI_API_KEY=ollama`, và dựng lại `workflow-bridge`. Mô hình 7 tỷ tham số cần khoảng 8 GB RAM; máy yếu hãy dùng dịch vụ ngoài như Mistral. Thành phần này chưa được kiểm thử tự động trong CI vì tải mô hình quá nặng.
