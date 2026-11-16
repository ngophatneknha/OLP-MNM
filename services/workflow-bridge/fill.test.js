// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalise, buildMessages } from './fill.js'

const fields = [
  { key: 'so_tien', label: 'Số tiền', type: 'number' },
  { key: 'ngay', label: 'Ngày', type: 'date' },
  { key: 'nha_cc', label: 'Nhà cung cấp', type: 'text' },
  { key: 'loai', label: 'Loại', type: 'select', options: ['Văn phòng phẩm', 'Thiết bị'] },
]

test('fill: giữ đúng trường, ép đúng kiểu, bỏ giá trị sai', () => {
  const out = normalise(fields, { so_tien: '1.250.000 đ', ngay: '2026-11-03', nha_cc: ' Công ty An Phát ', loai: 'Xe cộ', la: 'x' })
  assert.deepEqual(out, { so_tien: 1250000, ngay: '2026-11-03', nha_cc: 'Công ty An Phát' })
})

test('fill: ngày sai định dạng và số không phải số bị bỏ', () => {
  assert.deepEqual(normalise(fields, { so_tien: 'abc', ngay: '03/11/2026' }), {})
  assert.deepEqual(normalise(fields, null), {})
})

test('fill: câu lệnh gửi AI chứa mọi trường và cắt chứng từ quá dài', () => {
  const m = buildMessages(fields, 'x'.repeat(20000))
  assert.match(m[1].content, /so_tien/)
  assert.match(m[1].content, /Văn phòng phẩm \| Thiết bị/)
  assert.ok(m[1].content.length < 7000)
})
