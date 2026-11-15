// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Xuất hồ sơ và nhật ký ra CSV/JSON để dữ liệu dùng lại được ngoài hệ thống (nền tảng của không gian [D]).
// Hàm thuần, có kiểm thử: exporter.test.js. Chỉ xuất những gì người dùng đã được phép xem (dữ liệu đã tải bằng quyền của họ).

const HEADER = ['no', 'process', 'status', 'created_at', 'finished_at', 'step', 'action', 'actor', 'event_at', 'note']

/** Một ô CSV: bọc nháy kép khi cần, và chặn công thức bảng tính (ô bắt đầu bằng = + - @ bị Excel coi là công thức). */
export function csvCell(value) {
  let text = value === null || value === undefined ? '' : String(value)
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

/** Mỗi dòng là một sự kiện của một hồ sơ; hồ sơ chưa có sự kiện vẫn có một dòng để không mất hồ sơ. */
export function eventRows(submissions) {
  return submissions.flatMap((s) => {
    const head = [s.no, s.app.name, s.status, s.created_at, s.finished_at ?? '']
    if (!s.events.length) return [[...head, '', '', '', '', '']]
    return [...s.events].sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
      .map((e) => [...head, e.step_key, e.action, e.actor_name ?? '', e.created_at, e.note ?? ''])
  })
}

export const toCsv = (submissions) => [HEADER, ...eventRows(submissions)].map((row) => row.map(csvCell).join(',')).join('\r\n') + '\r\n'

export const toJson = (submissions) => JSON.stringify(submissions.map((s) => ({
  no: s.no, process: s.app.name, status: s.status, created_at: s.created_at, finished_at: s.finished_at, data: s.data,
  events: s.events.map((e) => ({ step: e.step_key, action: e.action, actor: e.actor_name ?? null, at: e.created_at, note: e.note ?? null })),
})), null, 2)

/** Tải một chuỗi thành tệp qua trình duyệt (BOM để Excel đọc đúng tiếng Việt). */
export function download(name, text, type) {
  const url = URL.createObjectURL(new Blob(['\ufeff', text], { type }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  URL.revokeObjectURL(url)
}
