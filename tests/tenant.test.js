// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Đa tổ chức: hai tổ chức dùng chung một hệ thống nhưng không thấy dữ liệu của nhau.
// Tổ chức mặc định (staff1, manager1, director1) và tổ chức B (staffb1, managerb1, directorb1). Mã ca: ORG-xx.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GW, ROOT, ROLE, login, gqlRaw, publishApp, submit, act, waitStatus, as, sql, uid, b64u } from './lib.js'

const REPAIR = JSON.parse(readFileSync(join(ROOT, 'library/iot/sua_chua.json'), 'utf8')).spec
const ONE_STEP = { fields: [{ key: 'so_tien', label: 'Số tiền', type: 'number', required: true }], steps: [{ key: 'truong_phong', name: 'Trưởng phòng duyệt', role: 'manager' }] }
const call = async (user, path, init = {}) => fetch(`${GW}${path}`, {
  ...init,
  headers: { authorization: `Bearer ${await login(user)}`, 'x-hasura-role': ROLE[user], 'content-type': 'application/json', ...init.headers },
})
const claims = async (user) => JSON.parse(Buffer.from((await login(user)).split('.')[1], 'base64url').toString())

describe('ORG: cách ly dữ liệu giữa các tổ chức', () => {
  let appA
  let appB
  let subA
  let subB

  test('ORG-01 org_id đi theo token: người của tổ chức B mang org_id = orgb; tài khoản cũ không mang gì (là tổ chức mặc định)', async () => {
    for (const u of ['staffb1', 'managerb1', 'directorb1']) assert.equal((await claims(u)).org_id, 'orgb', u)
    for (const u of ['staff1', 'manager1', 'director1']) assert.ok([undefined, 'default'].includes((await claims(u)).org_id), u)
  })

  test('ORG-02 mỗi tổ chức chỉ thấy quy trình của mình, kể cả trưởng phòng và giám đốc', async () => {
    appA = await publishApp()
    appB = await publishApp(ONE_STEP, 'managerb1')
    const keys = async (u) => (await as(u, '{ app { key } }')).data.app.map((a) => a.key)
    for (const u of ['manager1', 'director1', 'staff1']) { const k = await keys(u); assert.ok(k.includes(appA), u); assert.ok(!k.includes(appB), `${u} thấy quy trình của B`) }
    for (const u of ['managerb1', 'directorb1', 'staffb1']) { const k = await keys(u); assert.ok(k.includes(appB), u); assert.ok(!k.includes(appA), `${u} thấy quy trình của A`) }
    assert.equal(sql(`select org_id from app where key = '${appB}'`), 'orgb', 'quy trình tạo bởi người của B mang org_id của B, không do người gửi chọn')
    assert.equal(sql(`select org_id from app where key = '${appA}'`), 'default')
  })

  test('ORG-03 hồ sơ: gửi và duyệt trọn vẹn trong tổ chức B; tổ chức mặc định không thấy gì, B không gửi được vào quy trình của A', async () => {
    subA = (await submit('staff1', appA, { so_tien: 1_000_000 })).data.insert_submission_one.id
    const r = await submit('staffb1', appB, { so_tien: 2_000_000 })
    assert.ok(!r.errors, JSON.stringify(r.errors))
    subB = r.data.insert_submission_one.id
    assert.equal(sql(`select org_id from submission where id = '${subB}'`), 'orgb', 'hồ sơ mang org_id của quy trình nhận nó')
    await waitStatus('managerb1', subB, { current_step: 'truong_phong' })
    // Người của B gửi vào quy trình của A: không thấy quy trình nên bị từ chối.
    assert.ok((await submit('staffb1', appA, { so_tien: 1 })).errors, 'B gửi được vào quy trình của A')
    for (const u of ['manager1', 'director1']) {
      const ids = (await as(u, '{ submission { id } }')).data.submission.map((s) => s.id)
      assert.ok(!ids.includes(subB), `${u} thấy hồ sơ của B`)
      assert.equal((await as(u, 'query($i: uuid!) { submission_by_pk(id: $i) { id } }', { i: subB })).data.submission_by_pk, null)
    }
    for (const u of ['managerb1', 'directorb1']) {
      const ids = (await as(u, '{ submission { id } }')).data.submission.map((s) => s.id)
      assert.ok(!ids.includes(subA), `${u} thấy hồ sơ của A`)
      assert.ok(ids.includes(subB), u)
    }
  })

  test('ORG-04 không duyệt được hồ sơ của tổ chức khác; duyệt trong tổ chức mình thì chạy bình thường', async () => {
    const cross = await act('manager1', subB, 'truong_phong', 'approve')
    assert.ok(cross.errors, 'trưởng phòng A duyệt được hồ sơ của B')
    await waitStatus('managerb1', subB, { current_step: 'truong_phong' })
    const ok = await act('managerb1', subB, 'truong_phong', 'approve')
    assert.ok(!ok.errors, JSON.stringify(ok.errors))
    await waitStatus('staffb1', subB, { status: 'approved' })
    assert.equal((await as('manager1', 'query($i: uuid!) { submission_by_pk(id: $i) { status } }', { i: subB })).data.submission_by_pk, null)
  })

  test('ORG-05 lịch sử phiên bản, đề xuất, góp ý, nấc tự chủ của AI và nhật ký cũng cách ly', async () => {
    const issue = await as('staffb1', 'mutation($o: app_issue_insert_input!) { insert_app_issue_one(object: $o) { id } }', { o: { app_key: appB, title: 'Góp ý của tổ chức B' } })
    assert.ok(!issue.errors, JSON.stringify(issue.errors))
    const crossIssue = await as('staff1', 'mutation($o: app_issue_insert_input!) { insert_app_issue_one(object: $o) { id } }', { o: { app_key: appB, title: 'Góp ý chéo tổ chức' } })
    assert.ok(crossIssue.errors, 'A góp ý được vào quy trình của B')
    for (const [user, other] of [['manager1', appB], ['managerb1', appA]]) {
      const q = (await as(user, 'query($k: String!) { app_version(where: {app_key: {_eq: $k}}) { version } app_change(where: {app_key: {_eq: $k}}) { id } app_issue(where: {app_key: {_eq: $k}}) { id } step_autonomy(where: {app_key: {_eq: $k}}) { step_key } submission_event(where: {submission: {app_key: {_eq: $k}}}) { id } }', { k: other })).data
      for (const [name, rows] of Object.entries(q)) assert.equal(rows.length, 0, `${user} thấy ${name} của tổ chức khác`)
    }
    const own = (await as('managerb1', 'query($k: String!) { app_version(where: {app_key: {_eq: $k}}) { version } submission_event(where: {submission: {app_key: {_eq: $k}}}) { id } }', { k: appB })).data
    assert.ok(own.app_version.length >= 1 && own.submission_event.length >= 1, 'tổ chức B vẫn thấy dữ liệu của chính mình')
  })

  test('ORG-06 thông tin tổ chức: mỗi người chỉ đọc được dòng của tổ chức mình', async () => {
    assert.deepEqual((await as('staff1', '{ org { id } }')).data.org.map((o) => o.id), ['default'])
    assert.deepEqual((await as('staffb1', '{ org { id } }')).data.org.map((o) => o.id), ['orgb'])
  })

  test('ORG-07 giả mạo: tự gắn tiêu đề x-hasura-org-id hay đổi org_id trong token đều không vào được dữ liệu tổ chức khác', async () => {
    const token = await login('manager1')
    const res = await fetch(`${GW}/v1/graphql`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`, 'x-hasura-role': 'manager', 'x-hasura-org-id': 'orgb' }, body: JSON.stringify({ query: '{ app { key } }' }) })
    assert.ok(!(await res.json()).data.app.some((a) => a.key === appB), 'tiêu đề tự thêm đã đổi tổ chức')
    const [h, p, sig] = token.split('.')
    const forged = `${h}.${b64u({ ...JSON.parse(Buffer.from(p, 'base64url').toString()), org_id: 'orgb' })}.${sig}`
    assert.equal((await gqlRaw(forged, '{ app { key } }', undefined, 'manager')).status, 401, 'token sửa org_id phải bị từ chối vì sai chữ ký')
  })

  test('ORG-08 tệp đính kèm: người của tổ chức khác không đính vào hồ sơ của A', async () => {
    const r = await fetch(`${GW}/files`, { method: 'POST', headers: { authorization: `Bearer ${await login('staffb1')}`, 'x-hasura-role': 'staff', 'x-submission-id': subA, 'x-file-name': 'a.txt', 'content-type': 'text/plain' }, body: 'xin chao' })
    assert.ok(r.status >= 400 && r.status < 500, `phải bị từ chối, nhận ${r.status}`)
  })

  test('ORG-09 kho lạnh: mỗi tổ chức một chuỗi sổ cái riêng, tệp nằm dưới thư mục của tổ chức, kiểm chứng và liệt kê không lẫn', async () => {
    const r = await call('directorb1', '/archive?days=0', { method: 'POST' })
    assert.equal(r.status, 200)
    const out = await r.json()
    assert.ok(out.archived >= 1)
    assert.equal(sql(`select org_id from cold_archive where id = '${out.id}'`), 'orgb')
    assert.match(sql(`select object_key from cold_archive where id = '${out.id}'`), /^orgb\//)
    assert.equal(sql(`select count(*) from cold_item i join submission s on s.id = i.submission_id where i.archive_id = '${out.id}' and s.org_id <> 'orgb'`), '0', 'tệp của B chứa hồ sơ tổ chức khác')
    assert.equal(sql(`select count(*) from cold_item where submission_id = '${subA}'`), '0', 'hồ sơ của A bị B xuất')
    const listB = await (await call('directorb1', '/archive')).json()
    assert.ok(listB.length >= 1 && listB.every((a) => a.object_key.startsWith('orgb/')))
    const listA = await (await call('director1', '/archive')).json()
    assert.ok(!listA.some((a) => a.id === out.id), 'giám đốc A thấy lần xuất của B')
    for (const u of ['directorb1', 'director1']) { const v = await (await call(u, '/archive/verify')).json(); assert.equal(v.ok, true, `${u}: ${JSON.stringify(v.problems)}`) }
    // Chuỗi băm của B bắt đầu từ mốc đầu riêng, không nối vào chuỗi của A.
    assert.equal(sql(`select prev_hash from cold_archive where org_id = 'orgb' order by seq limit 1`), '0'.repeat(64))
  })

  test('ORG-10 cảm biến: ứng dụng sửa chữa phải thuộc tổ chức mình; danh sách và hồ sơ tự mở không lẫn tổ chức', async () => {
    const repairA = await publishApp(REPAIR)
    const repairB = await publishApp(REPAIR, 'managerb1')
    const key = `lanh_${uid()}`
    const body = (repair) => JSON.stringify({ key, name: 'Tủ lạnh B', unit: '°C', threshold: 8, direction: 'above', repair_app: repair })
    assert.equal((await call('directorb1', '/sensors', { method: 'POST', body: body(repairA) })).status, 400, 'B dùng quy trình sửa chữa của A')
    const reg = await call('directorb1', '/sensors', { method: 'POST', body: body(repairB) })
    assert.equal(reg.status, 201)
    const { token } = await reg.json()
    assert.equal(sql(`select org_id from sensor where key = '${key}'`), 'orgb')
    assert.ok(!(await (await call('director1', '/sensors')).json()).some((s) => s.key === key), 'giám đốc A thấy cảm biến của B')
    assert.ok((await (await call('directorb1', '/sensors')).json()).some((s) => s.key === key))
    const t = await fetch(`${GW}/telemetry/${key}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sensor-token': token }, body: JSON.stringify({ value: 12 }) })
    const res = await t.json()
    assert.equal(res.alarm, true)
    assert.equal(sql(`select org_id from submission where id = '${res.request}'`), 'orgb', 'hồ sơ sửa chữa tự mở phải thuộc tổ chức của cảm biến')
    assert.equal((await as('manager1', 'query($i: uuid!) { submission_by_pk(id: $i) { id } }', { i: res.request })).data.submission_by_pk, null)
  })

  test('ORG-11 nạp hàng loạt đi bằng quyền người nạp: B không nạp được vào quy trình của A', async () => {
    const r = await call('staffb1', `/ingest?app=${appA}`, { method: 'POST', body: JSON.stringify([{ so_tien: 5 }]) })
    const out = await r.json().catch(() => ({}))
    assert.ok(r.status >= 400 || (out.accepted ?? 0) === 0, `ingest chéo tổ chức không được thành công: ${r.status} ${JSON.stringify(out)}`)
    assert.equal(sql(`select count(*) from submission where app_key = '${appA}'`), '1', 'chỉ còn hồ sơ của chính tổ chức A')
  })
})
