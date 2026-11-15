// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { submissionText } from './search.js'

const sub = {
  no: 7, submitter_name: 'An Nguyễn', app: { name: 'Đề nghị thanh toán' },
  data: { so_tien: 5000000, ghi_chu: 'mua máy in', trong: '' },
  version: { spec: { fields: [{ key: 'so_tien', label: 'Số tiền' }, { key: 'ghi_chu', label: 'Ghi chú' }, { key: 'trong', label: 'Để trống' }, { key: 'khong_co', label: 'Không có' }] } },
  events: [{ note: 'Thiếu chứng từ', actor_name: 'Chi Lê' }, { note: null, actor_name: 'Chi Lê' }],
}

test('văn bản tìm kiếm gồm tên quy trình, người gửi, các ô đã điền kèm nhãn và ghi chú duyệt', () => {
  const t = submissionText(sub)
  for (const part of ['Đề nghị thanh toán số 7', 'Người gửi: An Nguyễn', 'Số tiền: 5000000', 'Ghi chú: mua máy in', 'Chi Lê: Thiếu chứng từ']) assert.ok(t.includes(part), part)
})

test('bỏ qua ô trống, ô không có dữ liệu và sự kiện không có ghi chú', () => {
  const t = submissionText(sub)
  assert.ok(!t.includes('Để trống') && !t.includes('Không có'))
  assert.equal(t.split('Chi Lê').length - 1, 1)
})
