// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Đề thi mục 4, nguyên lý (ii): hội tụ dữ liệu hành chính (IT) và dữ liệu vận hành (OT).
// Cảm biến gửi số đo qua cổng API bằng token thiết bị; vượt ngưỡng thì tự mở hồ sơ sửa chữa đi qua quy trình duyệt của người.
// Mã ca: IOT-xx.
import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { GW, ROOT, login, publishApp, act, waitStatus, sql, uid, run, wait } from './lib.js'

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
  test('IOT-07 khóa theo cảm biến: nhiều số đo vượt ngưỡng đến cùng lúc chỉ mở một hồ sơ sửa chữa', async () => {
    const app2 = await publishApp(REPAIR)
    const key2 = `lanh_${uid()}`
    const reg = await call('director1', '/sensors', { method: 'POST', body: JSON.stringify({ key: key2, name: 'Tủ lạnh song song', unit: '°C', threshold: 8, direction: 'above', repair_app: app2 }) })
    const { token: token2 } = await reg.json()
    const results = await Promise.all(Array.from({ length: 8 }, () => send(key2, token2, { value: 20 }).then((r) => r.json())))
    assert.equal(new Set(results.map((r) => r.request)).size, 1, 'số đo đồng thời mở nhiều hồ sơ')
    assert.equal(sql(`select count(*) from submission where app_key = '${app2}'`), '1')
  })
  test('IOT-08 NGSI-LD và vị trí: cảm biến có lat/lon hiện thành thực thể Device chuẩn; sai vị trí bị từ chối; chỉ trưởng phòng/giám đốc cùng tổ chức đọc được', async () => {
    const app3 = await publishApp(REPAIR)
    const key3 = `geo_${uid()}`
    const body = (extra) => JSON.stringify({ key: key3, name: 'Cảm biến có vị trí', unit: '°C', threshold: 8, direction: 'above', repair_app: app3, ...extra })
    assert.equal((await call('director1', '/sensors', { method: 'POST', body: body({ lat: 95, lon: 10 }) })).status, 400, 'vĩ độ ngoài khoảng')
    assert.equal((await call('director1', '/sensors', { method: 'POST', body: body({ lat: 10.8 }) })).status, 400, 'thiếu kinh độ')
    const reg = await call('director1', '/sensors', { method: 'POST', body: body({ lat: 10.8231, lon: 106.6297 }) })
    assert.equal(reg.status, 201)
    const { token: t3 } = await reg.json()
    await send(key3, t3, { value: 12 })
    const res = await call('manager1', '/ngsi-ld/v1/entities?type=Device')
    assert.equal(res.status, 200)
    assert.match(res.headers.get('content-type'), /ld\+json/)
    const e = (await res.json()).find((x) => x.id === `urn:ngsi-ld:Device:default:${key3}`)
    assert.ok(e, 'thiếu thực thể')
    assert.equal(e.type, 'Device')
    assert.deepEqual(e.location, { type: 'GeoProperty', value: { type: 'Point', coordinates: [106.6297, 10.8231] } })
    assert.equal(e.value.value, 12)
    assert.equal(e.alarm.value, true)
    assert.ok(e.value.observedAt)
    assert.equal((await call('director1', `/ngsi-ld/v1/entities/${encodeURIComponent(e.id)}`)).status, 200)
    assert.equal((await call('director1', '/ngsi-ld/v1/entities/urn:ngsi-ld:Device:default:khong_co')).status, 404)
    assert.equal((await call('staff1', '/ngsi-ld/v1/entities')).status, 403)
    assert.equal((await fetch(`${GW}/ngsi-ld/v1/entities`)).status, 401)
    const other = await (await call('directorb1', '/ngsi-ld/v1/entities')).json()
    assert.ok(!other.some((x) => x.id.includes(key3)), 'tổ chức B thấy thực thể của A')
    assert.equal(sql(`select lat || ',' || lon from sensor where key = '${key3}'`), '10.8231,106.6297')
  })
})

// Máy nhận thông báo thử: một container Node nhỏ gắn vào mạng của hệ thống với tên ngsi-sink (khớp NGSI_NOTIFY_ALLOW trong .env.example).
// Ghi mỗi thông báo nhận được ra stdout; đường dẫn có "fail" thì trả 500 để thử nhánh gửi lỗi.
const SINK = `ngsi-sink-${uid()}`
const SINK_JS = "require('http').createServer((q,r)=>{let b='';q.on('data',c=>b+=c);q.on('end',()=>{console.log(JSON.stringify({path:q.url,body:JSON.parse(b||'null')}));r.writeHead(q.url.includes('fail')?500:204).end()})}).listen(4000)"
const received = () => run('docker', ['logs', SINK]).split('\n').filter((l) => l.startsWith('{')).map((l) => JSON.parse(l))
async function waitReceived(pred, ms = 8000) {
  for (const end = Date.now() + ms; Date.now() < end; await wait(250)) if (received().filter(pred).length) return received().filter(pred)
  return []
}
const ld = { 'content-type': 'application/ld+json' }

describe('IOT NGSI-LD ghi và thuê bao (D-06)', () => {
  let repair
  let key
  let id
  let deviceToken
  let subId
  const patch = (user, value, eid = id) => call(user, `/ngsi-ld/v1/entities/${encodeURIComponent(eid)}/attrs`, { method: 'PATCH', headers: ld, body: JSON.stringify({ value: { type: 'Property', value } }) })
  before(() => {
    const bridge = run('docker', ['compose', 'ps', '-q', 'workflow-bridge']).trim()
    const net = run('docker', ['inspect', bridge, '--format', '{{range $k, $v := .NetworkSettings.Networks}}{{$k}}{{end}}']).trim()
    run('docker', ['run', '-d', '--rm', '--name', SINK, '--network', net, '--network-alias', 'ngsi-sink', 'node:22.19.0-alpine', 'node', '-e', SINK_JS])
  })
  after(() => { try { run('docker', ['rm', '-f', SINK]) } catch { /* đã dừng */ } })

  test('IOT-09 tạo Device bằng NGSI-LD: chỉ giám đốc; sai kiểu, sai id, tạo hộ tổ chức khác, trùng đều bị từ chối; trả Location và token thiết bị một lần', async () => {
    repair = await publishApp(REPAIR)
    key = `ngsi_${uid()}`
    id = `urn:ngsi-ld:Device:default:${key}`
    const entity = { id, type: 'Device', name: { type: 'Property', value: 'Tủ đông qua NGSI-LD' }, threshold: { type: 'Property', value: 8, unitCode: 'CEL' }, direction: { type: 'Property', value: 'above' }, repairApp: { type: 'Property', value: repair }, location: { type: 'GeoProperty', value: { type: 'Point', coordinates: [105.8542, 21.0285] } } }
    const post = (user, body) => call(user, '/ngsi-ld/v1/entities', { method: 'POST', headers: ld, body: JSON.stringify(body) })
    for (const user of ['staff1', 'manager1']) assert.equal((await post(user, entity)).status, 403, user)
    assert.equal((await post('director1', { ...entity, type: 'Building' })).status, 400, 'sai kiểu')
    assert.equal((await post('director1', { ...entity, id: key })).status, 400, 'id không phải URN')
    assert.equal((await post('director1', { ...entity, id: `urn:ngsi-ld:Device:orgb:${key}` })).status, 403, 'tạo hộ tổ chức khác')
    const r = await post('director1', entity)
    assert.equal(r.status, 201)
    assert.equal(r.headers.get('location'), `/ngsi-ld/v1/entities/${encodeURIComponent(id)}`)
    deviceToken = (await r.json()).deviceToken
    assert.ok(deviceToken.length >= 30)
    assert.ok(!sql(`select token_hash from sensor where key = '${key}'`).includes(deviceToken), 'chỉ lưu mã băm')
    assert.equal((await post('director1', entity)).status, 409, 'trùng')
    const e = await (await call('manager1', `/ngsi-ld/v1/entities/${encodeURIComponent(id)}`)).json()
    assert.deepEqual(e.location.value.coordinates, [105.8542, 21.0285])
    assert.equal(e.threshold.value, 8)
  })

  test('IOT-10 cập nhật số đo bằng PATCH /attrs: ghi thành số đo bất biến, vượt ngưỡng mở hồ sơ như /telemetry; sai quyền, sai thuộc tính, thực thể lạ bị từ chối', async () => {
    assert.equal((await patch('director1', 5)).status, 204)
    const e = await (await call('director1', `/ngsi-ld/v1/entities/${encodeURIComponent(id)}`)).json()
    assert.equal(e.value.value, 5)
    assert.ok(e.value.observedAt)
    assert.equal(sql(`select count(*) from sensor_reading where sensor_key = '${key}'`), '1')
    assert.equal((await patch('manager1', 6)).status, 403, 'trưởng phòng chỉ đọc')
    assert.equal((await call('director1', `/ngsi-ld/v1/entities/${encodeURIComponent(id)}/attrs`, { method: 'PATCH', headers: ld, body: JSON.stringify({ name: { type: 'Property', value: 'đổi tên' } }) })).status, 400, 'chỉ ghi được value')
    assert.equal((await patch('director1', 'nóng')).status, 400, 'value phải là số')
    assert.equal((await patch('director1', 6, 'urn:ngsi-ld:Device:default:khong_co')).status, 404)
    assert.equal((await patch('directorb1', 6)).status, 404, 'tổ chức B không ghi được thực thể của A')
    assert.equal((await send(key, deviceToken, { value: 4 })).status, 200, 'token thiết bị từ NGSI-LD dùng được cho /telemetry')
    assert.equal(sql(`select count(*) from submission where app_key = '${repair}'`), '0')
  })

  test('IOT-11 đăng ký thuê bao: chỉ giám đốc; endpoint ngoài danh sách cho phép, q sai, Device của tổ chức khác bị từ chối; tổ chức B không thấy, không xóa được', async () => {
    const post = (user, body) => call(user, '/ngsi-ld/v1/subscriptions', { method: 'POST', headers: ld, body: JSON.stringify(body) })
    const sub = { type: 'Subscription', entities: [{ type: 'Device', id }], watchedAttributes: ['value'], q: 'value>8', notification: { endpoint: { uri: 'http://ngsi-sink:4000/notify', accept: 'application/json' } } }
    assert.equal((await post('manager1', sub)).status, 403)
    for (const uri of ['http://postgres:5432/', 'http://hasura:8080/v2/query', 'http://ngsi-sink:4001/']) assert.equal((await post('director1', { ...sub, notification: { endpoint: { uri } } })).status, 400, uri)
    assert.equal((await post('director1', { ...sub, q: 'value>8 OR 1=1' })).status, 400, 'q sai')
    assert.equal((await post('director1', { ...sub, entities: [{ type: 'Device', id: `urn:ngsi-ld:Device:orgb:${key}` }] })).status, 400, 'Device tổ chức khác')
    const r = await post('director1', sub)
    assert.equal(r.status, 201)
    subId = decodeURIComponent(r.headers.get('location').split('/').pop())
    assert.match(subId, /^urn:ngsi-ld:Subscription:/)
    assert.equal((await post('director1', { ...sub, id: subId })).status, 409, 'trùng id')
    const mine = await (await call('manager1', '/ngsi-ld/v1/subscriptions')).json()
    assert.ok(mine.some((s) => s.id === subId))
    assert.ok(!(await (await call('directorb1', '/ngsi-ld/v1/subscriptions')).json()).some((s) => s.id === subId), 'tổ chức B thấy thuê bao của A')
    assert.equal((await call('directorb1', `/ngsi-ld/v1/subscriptions/${encodeURIComponent(subId)}`, { method: 'DELETE' })).status, 404)
  })

  test('IOT-12 thông báo: số đo dưới ngưỡng không gửi; vượt ngưỡng gửi đúng một Notification chuẩn; máy nhận lỗi được ghi lastFailure; hủy thuê bao thì ngừng gửi', async () => {
    const mine = (m) => m.body?.subscriptionId === subId
    assert.equal((await patch('director1', 7)).status, 204)
    await wait(1500)
    assert.equal(received().filter(mine).length, 0, 'q không thỏa vẫn gửi')
    assert.equal((await patch('director1', 11)).status, 204)
    const got = await waitReceived(mine)
    assert.equal(got.length, 1)
    assert.equal(got[0].path, '/notify')
    assert.equal(got[0].body.type, 'Notification')
    assert.equal(got[0].body.data[0].id, id)
    assert.equal(got[0].body.data[0].value.value, 11)
    let s
    for (let i = 0; i < 20; i += 1) { s = await (await call('director1', `/ngsi-ld/v1/subscriptions/${encodeURIComponent(subId)}`)).json(); if (s.notification.timesSent) break; await wait(250) }
    assert.equal(s.notification.timesSent, 1)
    assert.equal(s.notification.status, 'ok')
    // Máy nhận trả 500: không làm hỏng việc ghi số đo, trạng thái thuê bao báo lỗi kèm lý do.
    const bad = await call('director1', '/ngsi-ld/v1/subscriptions', { method: 'POST', headers: ld, body: JSON.stringify({ type: 'Subscription', entities: [{ type: 'Device', id }], notification: { endpoint: { uri: 'http://ngsi-sink:4000/fail' } } }) })
    const badId = decodeURIComponent(bad.headers.get('location').split('/').pop())
    assert.equal((await patch('director1', 12)).status, 204)
    let f
    for (let i = 0; i < 30; i += 1) { f = await (await call('director1', `/ngsi-ld/v1/subscriptions/${encodeURIComponent(badId)}`)).json(); if (f.notification.lastFailure) break; await wait(250) }
    assert.equal(f.notification.status, 'failed')
    assert.equal(f.notification.lastErrorReason, 'HTTP 500')
    for (const sid of [subId, badId]) assert.equal((await call('director1', `/ngsi-ld/v1/subscriptions/${encodeURIComponent(sid)}`, { method: 'DELETE' })).status, 204)
    assert.equal((await call('director1', `/ngsi-ld/v1/subscriptions/${encodeURIComponent(subId)}`)).status, 404)
    const before = received().filter(mine).length
    assert.equal((await patch('director1', 13)).status, 204)
    await wait(1500)
    assert.equal(received().filter(mine).length, before, 'đã hủy vẫn gửi')
  })
})
