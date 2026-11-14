// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
// Chạy: node --test services/workflow-bridge/probation.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseOpinion, buildMessages } from './probation.js'

test('chỉ nhận ý kiến đúng khuôn, không đoán khi mô hình trả lời lạ', () => {
  assert.deepEqual(parseOpinion('{"decision":"approve","reason":" Số tiền hợp lý "}'), { decision: 'approve', reason: 'Số tiền hợp lý' })
  assert.equal(parseOpinion('{"decision":"maybe","reason":"x"}'), null)
  assert.equal(parseOpinion('{"decision":"approve"}'), null)
  assert.equal(parseOpinion('{"decision":"approve","reason":"   "}'), null)
  assert.equal(parseOpinion('Tôi nghĩ nên duyệt'), null)
  assert.equal(parseOpinion('{"decision":"reject","reason":"' + 'a'.repeat(500) + '"}').reason.length, 300)
})

test('nội dung gửi AI có hồ sơ, bước và các quyết định trước đó của người', () => {
  const fields = [{ key: 'so_tien', label: 'Số tiền' }, { key: 'ly_do', label: 'Lý do' }]
  const [system, user] = buildMessages({
    app: { name: 'Tạm ứng', description: 'Xin tạm ứng tiền' }, step: { name: 'Trưởng phòng duyệt' }, fields,
    data: { so_tien: 3000000 },
    history: [{ action: 'reject', note: 'Thiếu lý do', data: { so_tien: 9000000 } }],
  })
  assert.match(system.content, /Trưởng phòng duyệt/)
  assert.match(user.content, /Số tiền: 3000000/)
  assert.match(user.content, /Lý do: \(để trống\)/)
  assert.match(user.content, /Người đã từ chối \(ghi chú: Thiếu lý do\)/)
})
