// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Đoạn trích từ máy chủ đánh dấu từ khớp bằng « ». Tách thành các mảnh để dựng bằng văn bản thuần:
// nội dung tệp do người dùng tải lên nên không bao giờ đưa vào v-html.

export const snippetParts = (snippet) => String(snippet).split(/(«[^»]*»)/).filter(Boolean)
  .map((p) => (p.startsWith('«') && p.endsWith('»') ? { text: p.slice(1, -1), hit: true } : { text: p, hit: false }))
