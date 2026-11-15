// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Đề thi mục 4, nguyên lý (ii): hội tụ dữ liệu hành chính (IT) và dữ liệu vận hành (OT).
// Cảm biến gửi số đo qua cổng API bằng token thiết bị; vượt ngưỡng thì tự mở hồ sơ sửa chữa đi qua quy trình duyệt của người.
// Mã ca: IOT-xx.
import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GW, ROOT, login, publishApp, act, waitStatus, sql, uid } from './lib.js'

const REPAIR = JSON.parse(readFileSync(join(ROOT, 'library/iot/sua_chua.json'), 'utf8')).spec
const call = async (user, path, init = {}) => fetch(`${GW}${path}`, {
  ...init,
  headers: { authorization: `Bearer ${await login(user)}`, 'x-hasura-role': user.replace(/\d/g, ''), 'content-type': 'application/json', ...init.headers },
})
const send = (key, token, body) => fetch(`${GW}/telemetry/${key}`, { method: 'POST', headers: { 'content-type': 'application/json', ...(token ? { 'x-sensor-token': token } : {}) }, body: JSON.stringify(body) })

describe('IOT: cảm biến (OT) mở yêu cầu sửa chữa trong quy trình nghiệp vụ (IT)', () => {
  let app
  let key
  let token
  let firstRequest

  test('IOT-01 chỉ giám đốc đăng ký cảm biến; token thiết bị trả về một lần; ứng dụng sửa chữa phải đủ trường', async () => {
    app = await publishApp(REPAIR)
    key = `lanh_${uid()}`
    const body = JSON.stringify({ key, name: 'Tủ lạnh kho 1', unit: '°C', threshold: 8, direction: 'above', repair_app: app })
    for (const user of ['staff1', 'manager1']) assert.equal((await call(user, '/sensors', { method: 'POST', body })).status, 403, user)
    const missing = await publishApp()
    assert.equal((await call('director1', '/sensors', { method: 'POST', body: JSON.stringify({ ...JSON.parse(body), key: `x_${uid()}`, repair_app: missing }) })).status, 400, 'ứng dụng thiếu trường thiet_bi... phải bị từ chối')
    const r = await call('director1', '/sensors', { method: 'POST', body })
    assert.equal(r.status, 201)
    token = (await r.json()).token
    assert.ok(token.length >= 30)
    assert.equal((await call('director1', '/sensors', { method: 'POST', body })).status, 409, 'trùng mã')
    // Chỉ lưu mã băm, không lưu token.
    assert.ok(!sql(`select token_hash from sensor where key = '${key}'`).includes(token))
  })
  test('IOT-02 số đo trong ngưỡng được ghi, không mở hồ sơ; vượt ngưỡng thì tự mở hồ sơ đúng ứng dụng, đúng dữ liệu, chờ trưởng phòng', async () => {
    const ok = await (await send(key, token, { value: 5 })).json()
    assert.deepEqual([ok.accepted, ok.alarm, ok.request], [1, false, null])
    assert.equal(sql(`select count(*) from submission where app_key = '${app}'`), '0')
    const bad = await (await send(key, token, { value: 11.5 })).json()
    assert.equal(bad.alarm, true)
    firstRequest = bad.request
    assert.ok(firstRequest)
    const s = await waitStatus('manager1', firstRequest, { status: 'running', current_step: 'truong_phong', waiting_role: 'manager' })
    assert.ok(s)
    assert.equal(sql(`select (data->>'cam_bien') || '|' || (data->>'gia_tri') from submission where id = '${firstRequest}'`), `${key}|11.5`)
  })
  test('IOT-03 số đo vượt ngưỡng liên tục không ngập hồ sơ: còn hồ sơ đang chạy thì dùng lại, không mở thêm', async () => {
    const again = await (await send(key, token, [{ value: 12 }, { value: 13 }])).json()
    assert.equal(again.accepted, 2)
    assert.equal(again.request, firstRequest)
    assert.equal(sql(`select count(*) from submission where app_key = '${app}'`), '1')
  })
  test('IOT-04 thiết bị lạ không vào được: không token, sai token, cảm biến không tồn tại cùng bị 401 (không dò ra mã nào có thật); số đo sai bị 400', async () => {
    assert.equal((await send(key, undefined, { value: 1 })).status, 401)
    assert.equal((await send(key, 'sai-token', { value: 1 })).status, 401)
    assert.equal((await send('khong_co_that', token, { value: 1 })).status, 401)
    assert.equal((await send(key, token, { value: 'abc' })).status, 400)
    assert.equal((await send(key, token, { value: 1, at: '2000-01-01T00:00:00Z' })).status, 400, 'quá cũ')
    assert.equal((await send(key, token, { value: 1, at: new Date(Date.now() + 3600_000).toISOString() })).status, 400, 'ở tương lai')
    assert.equal((await send(key, token, Array(101).fill({ value: 1 }))).status, 400, 'quá 100 số đo')
  })
  test('IOT-05 số đo là bằng chứng bất biến; bản sao số phản ánh trạng thái hiện tại; chỉ giám đốc/trưởng phòng xem', async () => {
    assert.throws(() => sql(`update sensor_reading set value = 0 where sensor_key = '${key}'`))
    assert.throws(() => sql(`delete from sensor_reading where sensor_key = '${key}'`))
    assert.equal((await call('staff1', '/sensors')).status, 403)
    const me = (await (await call('manager1', '/sensors')).json()).find((s) => s.key === key)
    assert.equal(me.alarm, true)
    assert.equal(me.last_value, 13)
    assert.equal(me.open_submission_id, firstRequest)
  })
  test('IOT-06 hồ sơ sửa chữa đi hết quy trình (trưởng phòng duyệt, kỹ thuật viên xác nhận); sau đó vượt ngưỡng lại thì mở hồ sơ mới', async () => {
    assert.ok(!(await act('manager1', firstRequest, 'truong_phong', 'approve')).errors)
    await waitStatus('manager1', firstRequest, { current_step: 'ky_thuat' })
    assert.ok(!(await act('staff1', firstRequest, 'ky_thuat', 'done')).errors)
    await waitStatus('manager1', firstRequest, { status: 'approved' })
    const next = await (await send(key, token, { value: 14 })).json()
    assert.ok(next.request && next.request !== firstRequest)
    assert.equal(sql(`select count(*) from submission where app_key = '${app}'`), '2')
  })
})
