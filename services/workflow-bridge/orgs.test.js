// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { validateNewUser, toRow, ROLE_SETS } from './orgs.js'

const ok = { username: 'ke.toan1', name: '  Lê Thị Kế Toán ', role: 'accountant', password: 'matkhau-tam' }

test('validateNewUser: nhận đầu vào hợp lệ, làm sạch họ tên, mặc định mật khẩu tạm', () => {
  assert.deepEqual(validateNewUser(ok), { username: 'ke.toan1', name: 'Lê Thị Kế Toán', role: 'accountant', password: 'matkhau-tam', temporary: true })
  assert.equal(validateNewUser({ ...ok, temporary: false }).temporary, false)
})

test('validateNewUser: từ chối tên đăng nhập xấu, thiếu tên, vai trò lạ (kể cả admin và tên thuộc tính JS), mật khẩu ngắn', () => {
  for (const bad of [{ username: 'A' }, { username: '1abc' }, { username: 'a b c' }, { username: 'ab' }, { name: '' }, { name: 'x'.repeat(101) }, { role: 'admin' }, { role: 'constructor' }, { role: undefined }, { password: 'ngan' }, { password: 5 }]) {
    assert.throws(() => validateNewUser({ ...ok, ...bad }), (e) => e.status === 400, JSON.stringify(bad))
  }
  assert.throws(() => validateNewUser(undefined), (e) => e.status === 400)
})

test('toRow: vai trò chính là vai trò cao nhất; staff khi chỉ có staff; tên rơi về username', () => {
  assert.equal(toRow({ id: 'i', username: 'u', firstName: 'A', lastName: 'B' }, ['staff', 'director']).role, 'director')
  assert.equal(toRow({ id: 'i', username: 'u' }, ['staff']).role, 'staff')
  assert.equal(toRow({ id: 'i', username: 'u' }, ['staff']).name, 'u')
  assert.equal(toRow({ id: 'i', username: 'u', enabled: false }, []).enabled, false)
  assert.ok(Object.values(ROLE_SETS).every((r) => r.includes('staff')))
})
