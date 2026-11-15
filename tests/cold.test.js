// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Đề thi mục 4, nguyên lý (i) và (iii): kho dữ liệu lạnh bất biến, phả hệ dữ liệu, nạp hàng loạt.
// Chạy trên hệ thống thật qua cổng API. Mã ca: COLD-xx, LIN-xx, ING-xx.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { GW, login, publishApp, submit, act, waitStatus, sql, run } from './lib.js'

const call = async (user, path, init = {}) => fetch(`${GW}${path}`, {
  ...init,
  headers: { authorization: `Bearer ${await login(user)}`, 'x-hasura-role': user.replace(/\d/g, ''), ...init.headers },
})

describe('COLD: kho dữ liệu lạnh (hồ sơ đã kết thúc xuống kho S3, sổ cái băm nối chuỗi)', () => {
  let app
  test('COLD-01 hồ sơ đã kết thúc được xuất ra kho lạnh kèm nhật ký, ghi vào sổ cái', async () => {
    app = await publishApp()
    const s = (await submit('staff1', app, { so_tien: 1_000_000 })).data.insert_submission_one.id
    await waitStatus('manager1', s, { current_step: 'truong_phong' })
    await act('manager1', s, 'truong_phong', 'approve')
    await waitStatus('manager1', s, { current_step: 'chi_tien' })
    await act('accountant1', s, 'chi_tien', 'done')
    await waitStatus('staff1', s, { status: 'approved' })
    const r = await call('director1', '/archive?days=0', { method: 'POST' })
    assert.equal(r.status, 200)
    const out = await r.json()
    assert.ok(out.archived >= 1, 'phải xuất ít nhất hồ sơ vừa kết thúc')
    assert.equal(sql(`select count(*) from cold_item where submission_id = '${s}'`), '1')
    const list = await (await call('director1', '/archive')).json()
    assert.ok(list.some((a) => a.id === out.id && a.rows === out.archived))
    // Chạy lại ngay thì không còn gì để xuất (không xuất trùng).
    // Các tệp kiểm thử khác chạy song song nên có thể vừa có hồ sơ khác kết thúc: chỉ khẳng định hồ sơ này không bị xuất lần hai.
    await call('director1', '/archive?days=0', { method: 'POST' })
    assert.equal(sql(`select count(*) from cold_item where submission_id = '${s}'`), '1')
  })
  test('COLD-02 kiểm chứng sổ cái: chuỗi băm liền mạch và mọi tệp còn nguyên', async () => {
    const v = await (await call('director1', '/archive/verify')).json()
    assert.equal(v.ok, true, JSON.stringify(v.problems))
    assert.ok(v.archives >= 1)
  })
  test('COLD-03 chống sửa: sổ cái không sửa/xóa được; tệp bị sửa thì kiểm chứng báo lỗi, trả lại thì hết lỗi', async () => {
    assert.throws(() => sql('update cold_archive set rows = rows + 1'), /chỉ được thêm|Command failed/)
    assert.throws(() => sql('delete from cold_item'), /chỉ được thêm|Command failed/)
    const key = sql('select object_key from cold_archive order by seq desc limit 1')
    // Chạy trong container cầu nối (có khóa S3): lưu bản gốc, ghi đè bằng nội dung khác, kiểm, rồi trả lại.
    const script = `
      import { s3fetch } from '/app/s3.js'
      const path = '/dxlab-cold/${key}'
      const original = Buffer.from(await (await s3fetch(path)).arrayBuffer())
      await s3fetch(path, { method: 'PUT', body: Buffer.from('bi sua') })
      const tampered = await (await fetch('http://localhost:3000/archive/verify', { headers: { authorization: 'Bearer x.' + Buffer.from(JSON.stringify({ realm_access: { roles: ['director'] } })).toString('base64url') + '.y' } })).json()
      await s3fetch(path, { method: 'PUT', body: original })
      console.log(JSON.stringify(tampered))`
    const tampered = JSON.parse(run('docker', ['compose', 'exec', '-T', 'workflow-bridge', 'node', '--input-type=module', '-e', script]).trim())
    assert.equal(tampered.ok, false)
    assert.ok(tampered.problems.some((p) => /nội dung tệp đã bị sửa/.test(p.error)))
    assert.equal((await (await call('director1', '/archive/verify')).json()).ok, true, 'trả lại bản gốc thì phải hết lỗi')
  })
  test('COLD-04 chỉ giám đốc vận hành kho lạnh: nhân viên, trưởng phòng bị 403; không token bị 401', async () => {
    for (const user of ['staff1', 'manager1']) {
      assert.equal((await call(user, '/archive')).status, 403, user)
      assert.equal((await call(user, '/archive?days=0', { method: 'POST' })).status, 403, user)
    }
    assert.equal((await fetch(`${GW}/archive`)).status, 401)
  })
})

describe('LIN: phả hệ dữ liệu lấy tự động từ danh mục PostgreSQL', () => {
  test('LIN-01 view báo cáo của ứng dụng vừa xuất bản được truy ngược về bảng nguồn, và luồng xuống kho lạnh có mặt', async () => {
    const app = await publishApp()
    const { edges } = await (await call('director1', '/lineage')).json()
    assert.ok(edges.some((e) => e.to === `bi.app_${app}` && e.from === 'public.submission'), 'thiếu cạnh bảng nguồn -> view báo cáo')
    assert.ok(edges.some((e) => /cold_archive/.test(e.to) && e.from === 'public.submission_event'))
  })
})

describe('ING: nạp hàng loạt hồ sơ', () => {
  test('ING-01 CSV: dòng hợp lệ được nhận, dòng sai bị từ chối kèm số dòng, không dòng nào lọt qua rào chắn của CSDL', async () => {
    const app = await publishApp()
    const csv = ['so_tien', '1500000', '2000000', 'khong-phai-so', '', '700000'].join(String.fromCharCode(10))
    const r = await call('staff1', `/ingest?app=${app}`, { method: 'POST', headers: { 'content-type': 'text/csv' }, body: csv })
    assert.equal(r.status, 200)
    const out = await r.json()
    // Dòng trống bị bỏ khi đọc CSV; "khong-phai-so" thành NaN nên bị CSDL từ chối.
    assert.equal(out.created, 3)
    assert.deepEqual(out.failed.map((f) => f.row), [3])
    assert.equal(sql(`select count(*) from submission where app_key = '${app}'`), '3')
  })
  test('ING-02 nạp bằng JSON; ứng dụng không tồn tại → 404; quá 500 dòng → 413; không token → 401', async () => {
    const app = await publishApp()
    const ok = await call('staff1', `/ingest?app=${app}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify([{ so_tien: 10 }, { so_tien: 20 }]) })
    assert.equal((await ok.json()).created, 2)
    assert.equal((await call('staff1', '/ingest?app=khong_co', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '[{"so_tien":1}]' })).status, 404)
    assert.equal((await call('staff1', `/ingest?app=${app}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Array(501).fill({ so_tien: 1 })) })).status, 413)
    assert.equal((await fetch(`${GW}/ingest?app=${app}`, { method: 'POST', body: '[]' })).status, 401)
  })
})
