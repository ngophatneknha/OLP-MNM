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

**Tìm ngữ nghĩa (tùy chọn).** Đặt `SEARCH_EMBEDDER=intfloat/multilingual-e5-small` trong `.env` rồi dựng lại `workflow-bridge`: Meilisearch tự nhúng văn bản bằng mô hình HuggingFace (tải khoảng 470 MB lần đầu; nhúng lại toàn bộ chỉ mục mất vài phút) và tìm lai từ khóa + ngữ nghĩa (`SEARCH_SEMANTIC_RATIO`, mặc định 0.5). Nhờ đó "thiết bị laptop cho văn phòng" tìm ra "mua máy tính xách tay cho phòng kế toán". Kết quả vẫn qua Hasura kiểm quyền, và vì tìm ngữ nghĩa luôn trả về láng giềng gần nhất nên hệ thống quét từng trang kết quả (tối đa 1000) cho đến khi đủ phần người hỏi được xem.

Giới hạn hiện tại, nói thẳng: không dùng cơ sở dữ liệu véc-tơ riêng như Qdrant (Meilisearch lo cả hai); tìm ngữ nghĩa mặc định tắt, mô hình nhỏ nên độ chính xác vừa phải và điểm xếp hạng không tách bạch tài liệu liên quan khỏi không liên quan; OCR chỉ đọc 10 trang đầu và phụ thuộc chất lượng ảnh. Kiểm thử: `SEARCH_OPTIONAL=1 node --test tests/search.test.js`.

## Mô hình AI chạy tại chỗ (Ollama)

Để dữ liệu không rời máy chủ, có thể chạy mô hình ngôn ngữ ngay trong Docker:

```bash
docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile ai up -d
docker compose -f docker-compose.yml -f docker-compose.optional.yml exec ollama ollama pull qwen2.5:7b
```

Rồi đặt trong `.env`: `AI_BASE_URL=http://ollama:11434/v1`, `AI_MODEL=qwen2.5:7b`, `AI_API_KEY=ollama`, và dựng lại `workflow-bridge`. Mô hình 7 tỷ tham số cần khoảng 8 GB RAM; máy yếu hãy dùng dịch vụ ngoài như Mistral. Thành phần này chưa được kiểm thử tự động trong CI vì tải mô hình quá nặng.

## Báo trước khi đủ bằng chứng

Bàn làm việc của giám đốc hiện dòng "N bước duyệt đã đủ bằng chứng để nâng nấc" khi một bước ở nấc 2 trở lên đạt 10 quyết định thật và 90% khớp. Trang Số liệu cho giám đốc thấy độ khớp chung. Việc nâng nấc vẫn do giám đốc bấm; cơ sở dữ liệu chặn nếu thiếu bằng chứng.
