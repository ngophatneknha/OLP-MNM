// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
import { test, mock } from 'node:test'
import assert from 'node:assert/strict'
import { live, tick, setConnected } from './live.js'

test('nhịp từ máy chủ tải lại ngay; mất kênh thì hỏi mỗi 3 giây; có kênh thì chỉ hỏi bù mỗi 30 giây', async () => {
  mock.timers.enable({ apis: ['setInterval', 'Date'] })
  let n = 0
  const stop = live(() => { n++ })
  setConnected(false)
  mock.timers.tick(3100)
  await Promise.resolve()
  assert.ok(n >= 1, 'đứt kênh phải hỏi định kỳ')
  const before = n
  setConnected(true)
  mock.timers.tick(10000)
  await Promise.resolve()
  assert.equal(n, before, 'có kênh thì không hỏi dày')
  tick()
  await Promise.resolve()
  assert.equal(n, before + 1, 'nhịp phải tải lại ngay')
  mock.timers.tick(31000)
  await Promise.resolve()
  assert.ok(n >= before + 2, 'vẫn hỏi bù sau 30 giây')
  stop()
  const after = n
  tick(); mock.timers.tick(5000)
  await Promise.resolve()
  assert.equal(n, after, 'hủy đăng ký rồi thì không chạy nữa')
  mock.timers.reset()
})
