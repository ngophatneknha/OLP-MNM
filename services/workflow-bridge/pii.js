// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Ẩn thông tin định danh cá nhân (PII) trước khi văn bản rời khỏi hệ thống, cụ thể là gửi tới máy chủ AI.
// shortcut: nhận dạng bằng mẫu (email, số điện thoại VN, CCCD 12 số, số thẻ); không nhận ra họ tên hay địa chỉ.
// Cần bắt cả tên: thêm bước nhận dạng thực thể có tên (NER) chạy tại chỗ.

const RULES = [
  [/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, '[EMAIL]'],
  [/\b\d{4}(?:[ -]\d{4}){2,3}(?:[ -]\d{1,4})?\b|\b\d{13,19}\b/g, '[SỐ THẺ]'],
  [/\b\d{12}\b/g, '[CCCD]'],
  [/(?<![\w+])(?:\+84|0084|0)[ .-]?\d{2,3}(?:[ .-]?\d{3}){2}(?!\d)/g, '[SĐT]'],
]

export const maskPii = (text) => RULES.reduce((s, [re, to]) => s.replace(re, to), String(text ?? ''))

/** Áp dụng cho danh sách tin nhắn gửi tới AI (chỉ đụng tới nội dung chữ). */
export const maskMessages = (messages) => messages.map((m) => (typeof m.content === 'string' ? { ...m, content: maskPii(m.content) } : m))
