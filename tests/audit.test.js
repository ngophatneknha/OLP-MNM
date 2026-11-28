// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Z-11: nhật ký thay đổi dữ liệu (audit_log) và dòng đời một hồ sơ (lineage). Chạy trên hệ thống lõi, không cần profile tùy chọn.
// Mã ca: AUDIT-xx (ai sửa gì, lúc nào, chống sửa lén), LINEAGE-xx (dữ liệu đi đâu, từ khi nào).
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { GW, ROLE, SPEC, login, as, sql, until, uid, publishApp, submit, act, waitStatus } from './lib.js'

const call = async (user, path, init = {}) => fetch(`${GW}${path}`, { ...init, headers: { authorization: `Bearer ${await login(user)}`, 'x-hasura-role': ROLE[user], ...init.headers } })
const rows = (q) => sql(q).split('\n').filter(Boolean)
const userId = async (user) => JSON.parse(Buffer.from((await login(user)).split('.')[1], 'base64url')).sub
/** Sửa thẳng một dòng audit_log bằng quyền siêu quản trị (tắt trigger chặn sửa), như kẻ có quyền máy chủ CSDL. */
const tamper = (set, where) => sql(`BEGIN; ALTER TABLE audit_log DISABLE TRIGGER audit_log_immutable; UPDATE audit_log SET ${set} WHERE ${where}; ALTER TABLE audit_log ENABLE TRIGGER audit_log_immutable; COMMIT;`)

describe('AUDIT: ai sửa dữ liệu, lúc nào, sửa gì (Z-11)', () => {
  test('AUDIT-01 sửa qua GraphQL được ghi người làm, vai trò, cột đổi từ giá trị gì sang gì; cột nhạy cảm chỉ ghi "đã đổi", không chép giá trị', async () => {
    const app = await publishApp({ ...SPEC, fields: [...SPEC.fields, { key: 'ghi_chu', label: 'Ghi chú', type: 'text' }] })
    const secret = `bimat${uid()}`
    const s = (await submit('staff1', app, { so_tien: 7, ghi_chu: secret })).data.insert_submission_one.id
    const [ins] = rows(`select actor_id, actor_role, via, changes ? 'data', changes -> 'data' ->> 'changed', changes -> 'status' ->> 'new' from audit_log where table_name = 'submission' and row_key = '${s}' and op = 'INSERT'`)
    assert.equal(ins, `${await userId('staff1')}|staff|hasura|t|true|running`)
    assert.equal(sql(`select count(*) from audit_log where changes::text like '%${secret}%'`), '0', 'dữ liệu hồ sơ không bị chép vào nhật ký không xóa được')
    assert.equal(sql(`select count(*) from audit_log where table_name = 'submission' and row_key = '${s}' and changes::text like '%submitter_name%' and changes -> 'submitter_name' ->> 'changed' is distinct from 'true'`), '0', 'tên người không bị chép')

    await until(() => sql(`select count(*) from step_autonomy where app_key = '${app}' and step_key = 'truong_phong'`) === '1', 'dòng nấc tự chủ')
    const raise = () => as('director1', 'mutation($k: String!) { update_step_autonomy(where: {app_key: {_eq: $k}, step_key: {_eq: "truong_phong"}}, _set: {level: 2}) { affected_rows } }', { k: app })
    const count = () => Number(sql(`select count(*) from audit_log where table_name = 'step_autonomy' and row_key = '${app}:truong_phong' and op = 'UPDATE'`))
    assert.ok(!(await raise()).errors)
    const [last] = rows(`select actor_id, actor_role, op, changes -> 'level' ->> 'old', changes -> 'level' ->> 'new' from audit_log where table_name = 'step_autonomy' and row_key = '${app}:truong_phong' order by id desc limit 1`)
    assert.equal(last, `${await userId('director1')}|director|UPDATE|1|2`)
    const n = count()
    assert.ok(!(await raise()).errors)
    assert.equal(count(), n, 'sửa mà không đổi giá trị (2 -> 2) không sinh dòng')
  })

  test('AUDIT-02 việc bridge làm tiếp sau một thao tác được ghi tên người bấm và mang mã truy vết; cột đổi liên tục do hệ thống (số đo cuối) không sinh dòng', async () => {
    const app = await publishApp()
    const s = (await submit('staff1', app, { so_tien: 3 })).data.insert_submission_one.id
    await waitStatus('manager1', s, { current_step: 'truong_phong' })
    assert.ok(!(await act('manager1', s, 'truong_phong', 'approve')).errors)
    await waitStatus('accountant1', s, { current_step: 'chi_tien' })
    const manager = await userId('manager1')
    const [r] = rows(`select actor_role, via, trace_id ~ '^[0-9a-f]{32}$' from audit_log where table_name = 'submission' and row_key = '${s}' and op = 'UPDATE'
      and changes -> 'current_step' ->> 'new' = 'chi_tien' and actor_id = '${manager}'`)
    assert.equal(r, 'manager|bridge|t', 'bước tiếp theo do bridge đặt nhưng ghi đúng người duyệt')
    const sensor = sql('select key from sensor limit 1')
    if (sensor) {
      const n = sql('select count(*) from audit_log')
      sql(`update sensor set last_value = coalesce(last_value, 0) + 1, last_at = now() where key = '${sensor}'`)
      assert.equal(sql('select count(*) from audit_log'), n)
    }
  })

  test('AUDIT-03 (nghịch) nhật ký không sửa, xóa, xóa sạch được, kể cả chủ sở hữu CSDL; sửa lén bằng quyền siêu quản trị bị /audit/verify chỉ đúng dòng', async () => {
    const id = sql('select max(id) from audit_log')
    for (const q of [`update audit_log set actor_id = 'x' where id = ${id}`, `delete from audit_log where id = ${id}`, 'truncate audit_log']) {
      assert.throws(() => sql(q), /chỉ được thêm/, q)
    }
    const verify = async () => (await call('director1', '/audit/verify')).json()
    assert.equal((await verify()).ok, true)
    const original = sql(`select actor_id from audit_log where id = ${id}`)
    tamper("actor_id = 'ke-gian'", `id = ${id}`)
    try {
      const v = await verify()
      assert.equal(v.ok, false)
      assert.deepEqual(v.broken, [{ id: Number(id), problem: 'nội dung dòng bị sửa' }])
    } finally {
      tamper(`actor_id = '${original}'`, `id = ${id}`)
    }
    assert.equal((await verify()).ok, true, 'trả lại đúng giá trị thì chuỗi lại khớp')
    for (const user of ['staff1', 'manager1', 'accountant1']) assert.equal((await call(user, '/audit/verify')).status, 403, user)
  })

  test('AUDIT-04 (nghịch) chỉ giám đốc xem lịch sử, và chỉ của tổ chức mình (API và GraphQL)', async () => {
    const app = await publishApp()
    const path = `/audit?table=app&key=${app}`
    const mine = await (await call('director1', path)).json()
    assert.ok(mine.some((r) => r.op === 'INSERT'), 'giám đốc thấy lúc quy trình được tạo')
    assert.deepEqual(await (await call('directorb1', path)).json(), [], 'giám đốc tổ chức khác không thấy gì')
    for (const user of ['staff1', 'manager1']) assert.equal((await call(user, path)).status, 403, user)
    assert.equal((await call('director1', '/audit?table=app')).status, 400, 'thiếu khóa')
    assert.equal((await call('director1', "/audit?table=app';drop&key=x")).status, 400, 'tên bảng lạ')
    const q = '{ audit_log(limit: 5) { id table_name org_id } }'
    assert.ok((await as('staff1', q)).errors, 'nhân viên không truy vấn được audit_log qua GraphQL')
    const b = (await as('directorb1', `{ audit_log(where: {table_name: {_eq: "app"}, row_key: {_eq: "${app}"}}) { id } }`)).data.audit_log
    assert.deepEqual(b, [])
    assert.ok((await as('director1', `{ audit_log(where: {table_name: {_eq: "app"}, row_key: {_eq: "${app}"}}) { id } }`)).data.audit_log.length >= 1)
  })
})

describe('LINEAGE: một hồ sơ đi đâu, từ khi nào (Z-11)', () => {
  test('LINEAGE-01 dòng đời hồ sơ: tạo, ai duyệt (có chữ ký số), bridge đổi trạng thái, xuống kho lạnh ở tệp nào kèm mã băm, mã truy vết để mở Jaeger', { timeout: 180_000 }, async () => {
    const app = await publishApp({ ...SPEC, fields: [...SPEC.fields, { key: 'ghi_chu', label: 'Ghi chú', type: 'text' }] })
    const secret = `bimat${uid()}`
    const s = (await submit('staff1', app, { so_tien: 9, ghi_chu: secret })).data.insert_submission_one.id
    await waitStatus('manager1', s, { current_step: 'truong_phong' })
    assert.ok(!(await act('manager1', s, 'truong_phong', 'approve')).errors)
    await waitStatus('accountant1', s, { current_step: 'chi_tien' })
    assert.ok(!(await act('accountant1', s, 'chi_tien', 'done')).errors)
    await waitStatus('staff1', s, { status: 'approved' })
    await until(async () => { const r = await call('director1', '/archive?days=0', { method: 'POST' }); return r.status === 200 && sql(`select count(*) from cold_item where submission_id = '${s}'`) === '1' }, 'hồ sơ xuống kho lạnh', 90_000)
    const res = await call('director1', `/lineage/submission/${s}`)
    assert.equal(res.status, 200)
    const l = await res.json()
    const what = l.timeline.map((t) => t.what)
    assert.equal(what[0], 'INSERT submission')
    assert.ok(what.includes('approve bước truong_phong') && what.includes('done bước chi_tien'))
    assert.ok(l.events.every((e) => e.signed), 'mỗi lần duyệt có chữ ký số')
    assert.ok(l.timeline.some((t) => t.what === 'UPDATE submission' && t.columns.includes('status') && t.via === 'bridge'))
    assert.match(l.archive.object_key, /^default\//)
    assert.match(l.archive.object_sha256, /^[0-9a-f]{64}$/)
    assert.ok(what.some((w) => w.startsWith('chuyển xuống kho lạnh')))
    assert.ok(l.traces.length >= 1 && l.traces.every((t) => /^[0-9a-f]{32}$/.test(t.trace_id) && t.jaeger.endsWith(t.trace_id)))
    const times = l.timeline.map((t) => new Date(t.at).getTime())
    assert.deepEqual(times, [...times].sort((a, b) => a - b), 'dòng thời gian theo thứ tự')
    assert.ok(!JSON.stringify(l).includes(secret), 'không trả dữ liệu hồ sơ')
  })

  test('LINEAGE-02 (nghịch) chỉ giám đốc cùng tổ chức xem được; hồ sơ tổ chức khác như không tồn tại; mã sai dạng bị từ chối', async () => {
    const app = await publishApp()
    const s = (await submit('staff1', app, { so_tien: 1 })).data.insert_submission_one.id
    assert.equal((await call('director1', `/lineage/submission/${s}`)).status, 200)
    assert.equal((await call('directorb1', `/lineage/submission/${s}`)).status, 404)
    for (const user of ['staff1', 'manager1', 'accountant1']) assert.equal((await call(user, `/lineage/submission/${s}`)).status, 403, user)
    assert.equal((await call('director1', '/lineage/submission/khong-phai-uuid')).status, 400)
    assert.equal((await call('director1', `/lineage/submission/${s.replace(/.$/, s.endsWith('0') ? '1' : '0')}`)).status, 404)
    assert.equal((await fetch(`${GW}/lineage/submission/${s}`)).status, 401, 'không token bị cổng chặn')
  })
})
