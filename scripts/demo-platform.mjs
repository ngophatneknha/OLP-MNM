// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Trình diễn nền tảng Tầng 1 trong khoảng 2 phút, từng bước in ra màn hình (không cần mở giao diện web):
//   1. Cảm biến OT gửi số đo vượt ngưỡng -> hệ thống tự mở hồ sơ sửa chữa trong quy trình duyệt (nguyên lý ii)
//   2. Kho lạnh: xuất hồ sơ đã kết thúc ra kho S3, kiểm chứng sổ cái băm nối chuỗi (nguyên lý i)
//   3. Phả hệ dữ liệu lấy từ danh mục PostgreSQL (nguyên lý iii)
//   4. Đa tổ chức: tổ chức B không thấy gì của tổ chức mặc định
//   5. Cổng API: không token bị chặn tại biên (nguyên lý iv)
// Chạy trên hệ thống đang chạy và đã nạp dữ liệu mẫu:  node scripts/demo-platform.mjs   (Node.js 22, không cần cài gói)
// Dùng các tài khoản mẫu qua client dòng lệnh dxlab-cli (chỉ cho môi trường phát triển, xem docs/VAN_HANH.md).
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const GW = process.env.GW_URL ?? 'http://localhost:9080'
const KC = process.env.KC_URL ?? 'http://localhost:8081'
const PASSWORD = 'dxlab-dev'
const ROLE = { manager1: 'manager', director1: 'director', directorb1: 'director', staffb1: 'staff', managerb1: 'manager' }
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const tokens = new Map()
async function login(user) {
  if (tokens.has(user)) return tokens.get(user)
  const res = await fetch(`${KC}/realms/dxlab/protocol/openid-connect/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: 'dxlab-cli', username: user, password: PASSWORD }) })
  if (!res.ok) throw new Error(`Không đăng nhập được ${user} (${res.status}). Hệ thống đã chạy và nạp dữ liệu mẫu chưa?`)
  const token = (await res.json()).access_token
  tokens.set(user, token)
  return token
}
const call = async (user, path, init = {}) => fetch(`${GW}${path}`, { ...init, headers: { authorization: `Bearer ${await login(user)}`, 'x-hasura-role': ROLE[user], 'content-type': 'application/json', ...init.headers } })
async function gql(user, query, variables) {
  const body = await (await call(user, '/v1/graphql', { method: 'POST', body: JSON.stringify({ query, variables }) })).json()
  if (body.errors) throw new Error(JSON.stringify(body.errors))
  return body.data
}
const step = (n, title) => console.log(`\n== ${n}. ${title}`)
const ok = (text) => console.log(`   ✔ ${text}`)
const fail = (text) => { console.error(`   ✖ ${text}`); process.exitCode = 1 }

// 1. Cảm biến -> hồ sơ sửa chữa
step(1, 'Cảm biến (OT) mở hồ sơ sửa chữa trong quy trình nghiệp vụ (IT)')
const lib = JSON.parse(readFileSync(join(ROOT, 'library/iot/sua_chua.json'), 'utf8'))
if (!(await gql('manager1', 'query($k: String!) { app_by_pk(key: $k) { status } }', { k: lib.key })).app_by_pk) {
  await gql('manager1', 'mutation($o: app_insert_input!) { insert_app_one(object: $o) { key } }', { o: { key: lib.key, name: lib.name, category: lib.category, description: lib.description, spec: lib.spec } })
}
for (let i = 0; i < 60; i += 1) {
  if ((await gql('manager1', 'query($k: String!) { app_by_pk(key: $k) { status } }', { k: lib.key })).app_by_pk.status === 'published') break
  await wait(1000)
}
ok(`Quy trình "${lib.name}" đã xuất bản`)
const key = `lanh_${Date.now().toString(36)}`
const reg = await call('director1', '/sensors', { method: 'POST', body: JSON.stringify({ key, name: 'Tủ lạnh kho 1', unit: '°C', threshold: 8, direction: 'above', repair_app: lib.key }) })
const { token } = await reg.json()
ok(`Giám đốc đăng ký cảm biến ${key}; token thiết bị chỉ hiện một lần`)
const send = (value) => fetch(`${GW}/telemetry/${key}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sensor-token': token }, body: JSON.stringify({ value }) }).then((r) => r.json())
ok(`Số đo 5 °C (trong ngưỡng): ${JSON.stringify(await send(5))}`)
const alarm = await send(12)
ok(`Số đo 12 °C (vượt ngưỡng 8): ${JSON.stringify(alarm)}`)
if (!alarm.alarm || !alarm.request) fail('Vượt ngưỡng mà không mở hồ sơ')
const bare = await fetch(`${GW}/telemetry/${key}`, { method: 'POST', body: JSON.stringify({ value: 99 }) })
ok(`Gửi không có token thiết bị bị từ chối: HTTP ${bare.status}`)

// 2. Kho lạnh
step(2, 'Kho lạnh: hồ sơ đã kết thúc xuống kho S3, sổ cái băm nối chuỗi')
const arch = await (await call('director1', '/archive?days=0', { method: 'POST' })).json()
ok(`Xuất ${arch.archived} hồ sơ đã kết thúc ra tệp JSONL${arch.id ? ` (lần xuất ${arch.id.slice(0, 8)})` : ''}`)
const list = await (await call('director1', '/archive')).json()
if (list[0]) ok(`Dòng sổ cái mới nhất: tệp ${list[0].object_key}, mã băm dòng ${list[0].entry_hash.slice(0, 16)}…`)
const verify = await (await call('director1', '/archive/verify')).json()
if (verify.ok) ok(`Kiểm chứng ${verify.archives} dòng sổ cái: chuỗi băm liền mạch, mọi tệp còn nguyên`)
else fail(`Kiểm chứng sổ cái thất bại: ${JSON.stringify(verify.problems)}`)

// 3. Phả hệ
step(3, 'Phả hệ dữ liệu lấy tự động từ danh mục PostgreSQL')
const { edges } = await (await call('director1', '/lineage')).json()
ok(`${edges.length} cạnh phả hệ, ví dụ: ${edges.slice(0, 2).map((e) => `${e.from} -> ${e.to}`).join('; ')}`)

// 4. Đa tổ chức
step(4, 'Đa tổ chức: tổ chức B không thấy gì của tổ chức mặc định')
const appsA = (await gql('manager1', '{ app { key } }')).app.map((a) => a.key)
const appsB = (await gql('managerb1', '{ app { key } }')).app.map((a) => a.key)
ok(`Tổ chức mặc định thấy ${appsA.length} quy trình; tổ chức B thấy ${appsB.length}`)
if (appsB.some((k) => appsA.includes(k))) fail('Tổ chức B thấy quy trình của tổ chức mặc định')
const subsB = (await gql('directorb1', '{ submission { id } }')).submission.length
ok(`Giám đốc tổ chức B thấy ${subsB} hồ sơ (hồ sơ của tổ chức mặc định không hiện)`)
const archB = await (await call('directorb1', '/archive')).json()
ok(`Kho lạnh của tổ chức B có ${archB.length} lần xuất (sổ cái riêng, không lẫn)`)

// 5. Cổng API
step(5, 'Cổng API kiểm token tại biên (zero-trust)')
const anon = await fetch(`${GW}/v1/graphql`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ query: '{ app { key } }' }) })
ok(`Không token: HTTP ${anon.status}`)
const forged = await fetch(`${GW}/v1/graphql`, { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer a.b.c' }, body: JSON.stringify({ query: '{ app { key } }' }) })
ok(`Token giả: HTTP ${forged.status}`)
if (anon.status !== 401 || forged.status !== 401) fail('Cổng API không chặn đúng')
console.log(process.exitCode ? '\nCó bước thất bại.' : '\nXong: nền tảng chạy đúng cả năm bước.')
