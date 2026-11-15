// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
// Chạy: node --test web/src/autonomy.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { agreement, canRaise, evidence, readyToPromote } from './autonomy.js'

const op = (matched, over = {}) => ({ submission: { app_key: 'a' }, step_key: 's', level: 2, matched, sample: false, ...over })
const many = (hits, total, over) => Array.from({ length: total }, (_, i) => op(i < hits, over))
const apps = [{ key: 'a', spec: { steps: [{ key: 's', type: 'approve' }, { key: 't', type: 'task' }] } }]

test('evidence bỏ qua nấc khác, dữ liệu mẫu và hồ sơ chưa có quyết định người', () => {
  const list = [...many(3, 4), op(true, { level: 3 }), op(true, { sample: true }), op(null)]
  assert.deepEqual(evidence(list, 'a', 's', 2), { total: 4, hits: 3 })
})

test('canRaise: nấc 1 luôn lên được; từ nấc 2 cần đủ 10 quyết định và 90% khớp; nấc 4 là trần', () => {
  assert.equal(canRaise({ total: 0, hits: 0 }, 1), true)
  assert.equal(canRaise({ total: 9, hits: 9 }, 2), false)
  assert.equal(canRaise({ total: 10, hits: 8 }, 2), false)
  assert.equal(canRaise({ total: 10, hits: 9 }, 2), true)
  assert.equal(canRaise({ total: 50, hits: 50 }, 4), false)
})

test('readyToPromote chỉ liệt kê bước duyệt đã đủ bằng chứng, bỏ bước thực hiện và nấc 1', () => {
  const levels = [{ app_key: 'a', step_key: 's', level: 2 }]
  assert.equal(readyToPromote(apps, levels, many(10, 10)).length, 1)
  assert.equal(readyToPromote(apps, levels, many(5, 10)).length, 0)
  assert.equal(readyToPromote(apps, [], many(10, 10)).length, 0, 'không có dòng nấc nghĩa là nấc 1')
})

test('agreement tính độ khớp chung', () => {
  assert.deepEqual(agreement([...many(2, 4), op(null), op(true, { sample: true })]), { total: 4, hits: 2 })
})
