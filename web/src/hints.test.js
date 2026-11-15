// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
// Chạy: node --test web/src/hints.test.js

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hoursWaiting, improvementHints, isOverdue, missingRoles } from './hints.js'

const T0 = Date.parse('2026-11-01T00:00:00Z')
const at = (h) => new Date(T0 + h * 3_600_000).toISOString()
const SPEC = { steps: [{ key: 'tp', name: 'Trưởng phòng', role: 'manager' }, { key: 'kt', name: 'Kế toán', role: 'accountant' }] }
const sub = (events, over = {}) => ({ status: 'approved', created_at: at(0), app: { key: 'a', name: 'A' }, version: { spec: SPEC }, events, ...over })
const ev = (step_key, h, action = 'approve') => ({ step_key, action, created_at: at(h) })

test('hoursWaiting và isOverdue tính từ dấu cuối cùng, hoặc từ lúc gửi nếu chưa có dấu', () => {
  const s = sub([ev('tp', 10)], { status: 'running' })
  assert.equal(hoursWaiting(s, T0 + 20 * 3_600_000), 10)
  assert.equal(isOverdue(s, T0 + 70 * 3_600_000), true)
  assert.equal(isOverdue(s, T0 + 50 * 3_600_000), false)
  assert.equal(isOverdue(sub([ev('tp', 1)]), T0 + 999 * 3_600_000), false, 'hồ sơ đã xong không quá hạn')
  assert.equal(hoursWaiting(sub([], { status: 'running' }), T0 + 5 * 3_600_000), 5)
})

test('improvementHints: bước chờ trung bình quá 48 giờ được gợi ý, kèm số mẫu', () => {
  const list = [0, 1, 2].map(() => sub([ev('tp', 72)]))
  const [h] = improvementHints(list)
  assert.equal(h.kind, 'slow')
  assert.equal(h.step, 'Trưởng phòng')
  assert.equal(h.count, 3)
})

test('improvementHints: hay bị từ chối thì gợi ý, dưới 3 mẫu thì không kết luận', () => {
  const rejected = [ev('tp', 1, 'reject')]
  const hints = improvementHints([sub(rejected), sub(rejected), sub([ev('tp', 1)])])
  assert.deepEqual(hints.map((h) => h.kind), ['rejected'])
  assert.deepEqual(improvementHints([sub(rejected), sub(rejected)]), [])
})

test('improvementHints: quy trình khỏe thì không gợi ý gì', () => {
  assert.deepEqual(improvementHints([0, 1, 2, 3].map(() => sub([ev('tp', 2), ev('kt', 4)]))), [])
})

test('missingRoles: vai trò quy trình cần mà chưa ký hồ sơ nào', () => {
  assert.deepEqual(missingRoles([sub([ev('tp', 1)])], [{ spec: SPEC }]), ['accountant'])
  assert.deepEqual(missingRoles([sub([ev('tp', 1), ev('kt', 2)])], [{ spec: SPEC }]), [])
})
