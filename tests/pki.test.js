// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Chữ ký số (PKI phần mềm) cho phê duyệt: mỗi hành động duyệt của người được ký bằng chứng thư X.509
// do CA của tổ chức cấp; chữ ký bất biến và kiểm chứng lại được. Mã ca: PKI-xx.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { X509Certificate, createVerify } from 'node:crypto'
import { GW, ROLE, login, publishApp, submit, act, waitStatus, until, as, sql } from './lib.js'

const ONE_STEP = { fields: [{ key: 'so_tien', label: 'Số tiền', type: 'number', required: true }], steps: [{ key: 'truong_phong', name: 'Trưởng phòng duyệt', role: 'manager' }] }
const call = async (user, path, init = {}) => fetch(`${GW}${path}`, { ...init, headers: { authorization: `Bearer ${await login(user)}`, 'x-hasura-role': ROLE[user], ...init.headers } })

describe('PKI: chữ ký số cho phê duyệt', () => {
  let subA
  let subB
  let eventA

  test('PKI-01 duyệt xong thì sự kiện có chữ ký; kiểm chứng trả về hợp lệ', async () => {
    const app = await publishApp(ONE_STEP)
    subA = (await submit('staff1', app, { so_tien: 5_000_000 })).data.insert_submission_one.id
    await waitStatus('manager1', subA, { current_step: 'truong_phong' })
    assert.ok(!(await act('manager1', subA, 'truong_phong', 'approve', 'Đồng ý')).errors)
    await waitStatus('staff1', subA, { status: 'approved' })
    eventA = await until(() => sql(`select e.id from submission_event e join event_signature s on s.event_id = e.id where e.submission_id = '${subA}'`) || false, 'chữ ký của sự kiện duyệt')
    const v = await (await call('manager1', `/signatures/verify?submission=${subA}`)).json()
    const signed = v.filter((e) => e.signed)
    assert.ok(signed.length >= 1)
    for (const e of signed) assert.equal(e.valid, true, JSON.stringify(e))
    assert.equal(signed[0].action, 'approve')
  })

  test('PKI-02 chứng thư X.509 thật: do CA của tổ chức cấp, đúng người ký, chữ ký kiểm chứng được bằng thư viện mật mã chuẩn', () => {
    const [cert, ca, payload, signature] = sql(`select s.cert_pem || '~~' || (select cert_pem from pki_key where subject = 'ca:default') || '~~' || s.payload || '~~' || s.signature from event_signature s where s.event_id = ${eventA}`).split('~~')
    const leaf = new X509Certificate(cert)
    const root = new X509Certificate(ca)
    assert.ok(leaf.verify(root.publicKey), 'chứng thư người ký không do CA cấp')
    assert.ok(root.ca && !leaf.ca)
    assert.equal(leaf.issuer.includes('DX-Lab CA default'), true)
    const check = (text) => createVerify('sha256').update(text).verify(leaf.publicKey, Buffer.from(signature, 'base64'))
    assert.equal(check(payload), true)
    assert.equal(check(payload.replace('approve', 'reject')), false, 'sửa nội dung mà chữ ký vẫn đúng')
    assert.equal(JSON.parse(payload).submission, subA)
  })

  test('PKI-03 chữ ký và khóa chỉ thêm, không sửa hay xóa; khóa riêng luôn được mã hóa và không mở qua API', async () => {
    const bad = (q) => assert.throws(() => sql(q), 'phải bị chặn')
    bad(`update event_signature set signature = 'x' where event_id = ${eventA}`)
    bad(`delete from event_signature where event_id = ${eventA}`)
    bad('truncate event_signature')
    bad(`update pki_key set cert_pem = 'x' where subject = 'ca:default'`)
    bad(`delete from pki_key where subject = 'ca:default'`)
    assert.equal(sql(`select count(*) from pki_key where key_enc not like 'v1:%' or key_enc like '%PRIVATE KEY%'`), '0')
    const r = await as('director1', '{ pki_key { subject } }')
    assert.ok(r.errors, 'bảng khóa không được mở qua Hasura')
  })

  test('PKI-04 mỗi tổ chức một CA riêng; tải được chứng thư CA của tổ chức mình', async () => {
    const appB = await publishApp(ONE_STEP, 'managerb1')
    subB = (await submit('staffb1', appB, { so_tien: 1 })).data.insert_submission_one.id
    await waitStatus('managerb1', subB, { current_step: 'truong_phong' })
    assert.ok(!(await act('managerb1', subB, 'truong_phong', 'approve')).errors)
    await until(() => sql(`select 1 from event_signature s join submission_event e on e.id = s.event_id where e.submission_id = '${subB}'`) || false, 'chữ ký của tổ chức B')
    const [a, b] = await Promise.all([call('director1', '/pki/ca'), call('directorb1', '/pki/ca')])
    assert.equal(a.status, 200)
    const certA = new X509Certificate(await a.text())
    const certB = new X509Certificate(await b.text())
    assert.notEqual(certA.fingerprint256, certB.fingerprint256)
    assert.ok(certB.subject.includes('orgb'))
    assert.equal(sql(`select count(*) from pki_key where kind = 'ca'`) >= 2, true)
  })

  test('PKI-05 cách ly: người ngoài tổ chức không đọc được chữ ký và không kiểm chứng được hồ sơ của B', async () => {
    const sigs = (await as('manager1', 'query($s: uuid!) { event_signature(where: {event: {submission_id: {_eq: $s}}}) { event_id } }', { s: subB })).data.event_signature
    assert.equal(sigs.length, 0, 'tổ chức A đọc được chữ ký của B')
    const mine = (await as('managerb1', 'query($s: uuid!) { event_signature(where: {event: {submission_id: {_eq: $s}}}) { event_id } }', { s: subB })).data.event_signature
    assert.ok(mine.length >= 1)
    const v = await (await call('manager1', `/signatures/verify?submission=${subB}`)).json()
    assert.equal(v.filter((e) => e.signed).length, 0)
  })

  test('PKI-06 không có token thì cổng API chặn; mã hồ sơ sai bị từ chối', async () => {
    assert.equal((await fetch(`${GW}/pki/ca`)).status, 401)
    assert.equal((await fetch(`${GW}/signatures/verify?submission=${subA}`)).status, 401)
    assert.equal((await call('manager1', '/signatures/verify?submission=khong-phai-uuid')).status, 400)
  })

  test('PKI-07 hành động của AI không bị ký thay người', () => {
    assert.equal(sql(`select count(*) from event_signature s join submission_event e on e.id = s.event_id where e.actor_id = 'ai'`), '0')
  })
})
