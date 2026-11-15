# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# Trạm đọc chữ từ PDF và ảnh cho tìm kiếm: poppler (pdftotext) cho PDF có lớp chữ, Tesseract (tiếng Việt + Anh) cho PDF quét và ảnh.
# Chỉ chạy trong mạng nội bộ của compose (không công bố cổng); mỗi yêu cầu có giới hạn thời gian và dung lượng.
FROM python:3.12-slim
RUN apt-get update \
 && apt-get install -y --no-install-recommends poppler-utils tesseract-ocr tesseract-ocr-vie tesseract-ocr-eng \
 && rm -rf /var/lib/apt/lists/* \
 && useradd --no-create-home --uid 10001 extractor
COPY server.py /server.py
ENV XDG_CACHE_HOME=/tmp
USER extractor
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=3s --start-period=5s CMD python -c "import urllib.request;urllib.request.urlopen('http://127.0.0.1:8000/healthz')"
CMD ["python", "/server.py"]
