// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { entryHash, rolesOf, orgOf } from './cold.js'

test('mã băm dòng sổ phụ thuộc mọi thành phần (đổi một thứ là đổi mã)', () => {
  const zero = '0'.repeat(64)
  const base = entryHash(zero, 'a'.repeat(64), 3, '2026/11/x.jsonl')
  assert.match(base, /^[0-9a-f]{64}$/)
  assert.notEqual(base, entryHash('1'.repeat(64), 'a'.repeat(64), 3, '2026/11/x.jsonl'))
  assert.notEqual(base, entryHash(zero, 'b'.repeat(64), 3, '2026/11/x.jsonl'))
  assert.notEqual(base, entryHash(zero, 'a'.repeat(64), 4, '2026/11/x.jsonl'))
  assert.notEqual(base, entryHash(zero, 'a'.repeat(64), 3, '2026/11/y.jsonl'))
})

test('đọc vai trò từ token, token hỏng thì không có vai trò nào', () => {
  const token = `x.${Buffer.from(JSON.stringify({ realm_access: { roles: ['director'] } })).toString('base64url')}.y`
  assert.deepEqual(rolesOf({ headers: { authorization: `Bearer ${token}` } }), ['director'])
  assert.deepEqual(rolesOf({ headers: { authorization: 'Bearer rac' } }), [])
  assert.deepEqual(rolesOf({ headers: {} }), [])
})

test('tổ chức lấy từ token: thiếu claim là mặc định, mã lạ bị từ chối', () => {
  const req = (claims) => ({ headers: { authorization: `Bearer x.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.y` } })
  assert.equal(orgOf(req({})), 'default')
  assert.equal(orgOf(req({ org_id: 'orgb' })), 'orgb')
  assert.throws(() => orgOf(req({ org_id: "x'; drop table app;--" })), /không hợp lệ/)
  assert.throws(() => orgOf(req({ org_id: 5 })), /không hợp lệ/)
})
