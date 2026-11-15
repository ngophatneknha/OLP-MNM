// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { breaches, tokenMatches } from './sensors.js'

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
