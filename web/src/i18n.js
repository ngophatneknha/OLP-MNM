// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Đa ngôn ngữ vi/en không thêm thư viện: một bảng khoá, ngôn ngữ lưu ở trình duyệt.
// shortcut: mới dịch khung điều hướng và các trang Bảng công việc, Lịch, Cá nhân; các trang cũ còn tiếng Việt, dịch dần theo từng trang.

import { reactive } from 'vue'
import { MESSAGES } from './messages.js'

let saved = 'vi'
try { saved = localStorage.getItem('lang') || 'vi' } catch { /* chặn lưu trữ: dùng mặc định */ }
export const i18n = reactive({ lang: saved in MESSAGES ? saved : 'vi' })

export const t = (key) => MESSAGES[i18n.lang][key] ?? MESSAGES.vi[key] ?? key

export function setLang(lang) {
  i18n.lang = lang
  document.documentElement.lang = lang
  try { localStorage.setItem('lang', lang) } catch { /* không lưu được thì thôi */ }
}
