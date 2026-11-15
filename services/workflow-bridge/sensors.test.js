// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { breaches, tokenMatches, withLock } from './sensors.js'

test('vượt ngưỡng: đúng chiều, bằng ngưỡng chưa tính là vượt', () => {
  assert.equal(breaches(8.1, 8, 'above'), true)
  assert.equal(breaches(8, 8, 'above'), false)
  assert.equal(breaches(7.9, 8, 'below'), true)
  assert.equal(breaches(8, 8, 'below'), false)
  assert.equal(breaches(-1, 0, 'above'), false)
})

test('token thiết bị: đúng mới khớp mã băm đã lưu; thiếu, sai, hay mã băm hỏng đều không khớp', () => {
  const hash = createHash('sha256').update('bi-mat').digest('hex')
  assert.equal(tokenMatches('bi-mat', hash), true)
  assert.equal(tokenMatches('bi-mat ', hash), false)
  assert.equal(tokenMatches(undefined, hash), false)
  assert.equal(tokenMatches('bi-mat', 'abc'), false)
})

test('khóa theo cảm biến: việc cùng khóa chạy lần lượt, khác khóa chạy song song, lỗi không làm kẹt hàng đợi', async () => {
  const order = []
  const job = (name, ms, fail) => withLock('a', async () => { order.push(`${name}+`); await new Promise((r) => setTimeout(r, ms)); order.push(`${name}-`); if (fail) throw new Error('lỗi') })
  const results = await Promise.allSettled([job('1', 20, true), job('2', 5), job('3', 1)])
  assert.deepEqual(order, ['1+', '1-', '2+', '2-', '3+', '3-'])
  assert.deepEqual(results.map((r) => r.status), ['rejected', 'fulfilled', 'fulfilled'])
  let other = false
  await Promise.all([withLock('x', () => new Promise((r) => setTimeout(r, 20))), withLock('y', async () => { other = true })])
  assert.equal(other, true)
})
