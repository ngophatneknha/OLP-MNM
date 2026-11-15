// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { maskPii } from './pii.js'

test('ẩn email, số điện thoại, CCCD, số thẻ', () => {
  assert.equal(maskPii('Liên hệ an.nguyen@congty.vn hoặc 0912 345 678, +84 912345678'), 'Liên hệ [EMAIL] hoặc [SĐT], [SĐT]')
  assert.equal(maskPii('CCCD 079123456789, thẻ 4111 1111 1111 1111'), 'CCCD [CCCD], thẻ [SỐ THẺ]')
})
test('không đụng tới số tiền và ngày thông thường', () => {
  const s = 'Chi 5000000 đồng ngày 2026-11-15, số lượng 120, mã hồ sơ 42'
  assert.equal(maskPii(s), s)
})
