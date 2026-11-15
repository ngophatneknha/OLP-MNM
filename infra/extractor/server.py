# SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
# SPDX-License-Identifier: Apache-2.0
#
# POST /extract (thân là tệp thô, tiêu đề content-type) -> {"text": "...", "method": "pdftotext" | "ocr"}
# PDF có lớp chữ: pdftotext. PDF quét (ít chữ) và ảnh: OCR bằng Tesseract (vie+eng), tối đa 10 trang.
# shortcut: một tiến trình, mỗi yêu cầu chạy lần lượt trong luồng riêng; chất lượng OCR phụ thuộc ảnh gốc; không xử lý hàng đợi hay nhiều máy.
import json
import os
import subprocess
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

MAX_BYTES = 12 * 1024 * 1024
MAX_PAGES = 10
TIMEOUT = 120
MIN_TEXT = 20  # ít hơn từng này ký tự không khoảng trắng thì coi PDF là bản quét
IMAGE = ("image/png", "image/jpeg", "image/tiff", "image/bmp", "image/gif")


def run(args, **kw):
    return subprocess.run(args, capture_output=True, timeout=TIMEOUT, check=False, **kw)


def ocr(path):
    out = run(["tesseract", path, "stdout", "-l", "vie+eng"])
    return out.stdout.decode("utf-8", "replace")


def extract(data, content_type):
    with tempfile.TemporaryDirectory() as tmp:
        src = os.path.join(tmp, "in")
        with open(src, "wb") as f:
            f.write(data)
        if content_type == "application/pdf" or data[:5] == b"%PDF-":
            text = run(["pdftotext", "-layout", "-l", str(MAX_PAGES), src, "-"]).stdout.decode("utf-8", "replace")
            if len("".join(text.split())) >= MIN_TEXT:
                return text, "pdftotext"
            run(["pdftoppm", "-r", "200", "-png", "-l", str(MAX_PAGES), src, os.path.join(tmp, "p")])
            pages = sorted(n for n in os.listdir(tmp) if n.startswith("p") and n.endswith(".png"))
            return "\n".join(ocr(os.path.join(tmp, n)) for n in pages), "ocr"
        if content_type in IMAGE:
            return ocr(src), "ocr"
        return None, None


class Handler(BaseHTTPRequestHandler):
    def log_message(self, *_):  # không ghi nội dung tệp hay đường dẫn vào nhật ký
        pass

    def reply(self, status, body):
        raw = json.dumps(body, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("content-type", "application/json")
        self.send_header("content-length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def do_GET(self):
        self.reply(200 if self.path == "/healthz" else 404, {"ok": True})

    def do_POST(self):
        length = int(self.headers.get("content-length") or 0)
        if self.path != "/extract" or length <= 0 or length > MAX_BYTES:
            return self.reply(400 if self.path == "/extract" else 404, {"message": "Yêu cầu không hợp lệ"})
        try:
            text, method = extract(self.rfile.read(length), (self.headers.get("content-type") or "").split(";")[0].strip().lower())
        except subprocess.TimeoutExpired:
            return self.reply(504, {"message": "Đọc chữ quá lâu"})
        if text is None:
            return self.reply(415, {"message": "Chỉ đọc PDF và ảnh"})
        self.reply(200, {"text": text, "method": method})


ThreadingHTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
