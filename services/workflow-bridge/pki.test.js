// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { X509Certificate } from 'node:crypto'
import { newCa, newLeaf, canonicalPayload, signPayload, verifySignature, encryptKey, decryptKey, fingerprint } from './pki.js'

const ev = { id: 7, submission_id: '11111111-1111-1111-1111-111111111111', step_key: 'truong_phong', action: 'approve', note: null, actor_id: 'u1', created_at: '2026-11-16T01:02:03.000Z' }
const setup = (org = 'default') => {
  const ca = newCa(org)
  const leaf = newLeaf(ca, org, 'u1', 'Nguyễn Văn Á')
  const payload = canonicalPayload(ev, 'a'.repeat(64))
  return { ca, leaf, payload, signature: signPayload(payload, leaf.keyPem) }
}

test('chứng thư CA và người ký là X.509 hợp lệ, người ký do CA cấp', () => {
  const { ca, leaf } = setup()
  const caCert = new X509Certificate(ca.certPem)
  const cert = new X509Certificate(leaf.certPem)
  assert.equal(caCert.ca, true)
  assert.equal(cert.ca, false)
  assert.ok(caCert.verify(caCert.publicKey), 'CA tự ký')
  assert.ok(cert.checkIssued(caCert) && cert.verify(caCert.publicKey))
  assert.match(cert.subject, /Nguyễn Văn Á/)
  assert.match(caCert.subject, /DX-Lab CA default/)
  assert.match(fingerprint(leaf.certPem), /^[0-9a-f]{64}$/)
})

test('chữ ký đúng thì hợp lệ; sửa nội dung, chữ ký, hay dùng CA khác đều bị phát hiện', () => {
  const { ca, leaf, payload, signature } = setup()
  const base = { payload, signature, certPem: leaf.certPem, caPem: ca.certPem, signedAt: '2026-11-16T01:02:04Z' }
  assert.equal(verifySignature(base).valid, true)
  assert.equal(verifySignature({ ...base, payload: payload.replace('approve', 'reject') }).valid, false, 'đổi hành động')
  assert.equal(verifySignature({ ...base, payload: payload.replace('u1', 'u2') }).valid, false, 'đổi người ký')
  const other = setup('orgb')
  assert.equal(verifySignature({ ...base, caPem: other.ca.certPem }).valid, false, 'CA của tổ chức khác')
  assert.equal(verifySignature({ ...base, signature: other.signature }).valid, false, 'chữ ký của người khác')
  assert.equal(verifySignature({ ...base, certPem: other.leaf.certPem }).valid, false, 'chứng thư của tổ chức khác')
  assert.equal(verifySignature({ ...base, signedAt: '2040-01-01T00:00:00Z' }).valid, false, 'ký sau khi chứng thư hết hạn')
  assert.equal(verifySignature({ ...base, signature: 'rac' }).valid, false)
})

test('mã băm dữ liệu hồ sơ nằm trong bản tóm tắt: đổi dữ liệu thì chữ ký cũ không còn khớp', () => {
  const { ca, leaf, signature } = setup()
  const changed = canonicalPayload(ev, 'b'.repeat(64))
  assert.equal(verifySignature({ payload: changed, signature, certPem: leaf.certPem, caPem: ca.certPem, signedAt: '2026-11-16T01:02:04Z' }).valid, false)
})

test('khóa riêng mã hóa khi lưu: giải mã đúng khóa chủ, sai khóa chủ hay bị sửa thì lỗi', () => {
  const { leaf } = setup()
  const stored = encryptKey(leaf.keyPem, 'khoa-chu')
  assert.ok(!stored.includes('PRIVATE KEY'))
  assert.equal(decryptKey(stored, 'khoa-chu'), leaf.keyPem)
  assert.throws(() => decryptKey(stored, 'sai'))
  const parts = stored.split(':'); parts[4] = Buffer.from('xx').toString('base64')
  assert.throws(() => decryptKey(parts.join(':'), 'khoa-chu'))
})
