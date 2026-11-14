// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Hạ tầng dùng chung cho bộ kiểm thử đối chiếu đề thi. Chạy với hệ thống đang chạy (docker compose up -d).
// Không phụ thuộc thư viện ngoài: node:test + fetch.

import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
export const KC = process.env.KC_URL ?? 'http://localhost:8081'
export const GW = process.env.GW_URL ?? 'http://localhost:9080'
export const WEB = process.env.WEB_URL ?? 'http://localhost:3000'
const TOKEN_URL = `${KC}/realms/dxlab/protocol/openid-connect/token`
export const PASSWORD = 'dxlab-dev'

export const run = (cmd, args, opts = {}) => execFileSync(cmd, args, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20, ...opts })

/** Chạy SQL trong container PostgreSQL bằng quyền chủ sở hữu CSDL (để đối chứng độc lập với lớp API). */
export function sql(query, db = 'dxlab') {
  return run('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', 'dxlab', '-d', db, '-At', '-F', '|', '-c', query]).trim()
}

const cache = new Map()
export async function login(user, password = PASSWORD, client = 'dxlab-cli') {
  const key = `${user}/${client}`
  if (password === PASSWORD && cache.has(key) && cache.get(key).exp > Date.now()) return cache.get(key).token
  let res
  for (let i = 0; i < 4; i += 1) { // Keycloak đôi khi từ chối thoáng qua khi nhiều tệp kiểm thử đăng nhập cùng lúc
    res = await fetch(TOKEN_URL, { method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: client, username: user, password }) })
    if (res.ok || password !== PASSWORD) break
    await wait(1500)
  }
  if (!res.ok) throw new Error(`đăng nhập ${user}: ${res.status} ${await res.text()}`)
  const token = (await res.json()).access_token
  if (password === PASSWORD) cache.set(key, { token, exp: Date.now() + 200_000 })
  return token
}
export const ROLE = { staff1: 'staff', staff2: 'staff', manager1: 'manager', director1: 'director', accountant1: 'accountant' }

export async function gqlRaw(token, query, variables, role) {
  const res = await fetch(`${GW}/v1/graphql`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}), ...(role ? { 'x-hasura-role': role } : {}) },
    body: JSON.stringify({ query, variables }),
  })
  return { status: res.status, body: await res.json().catch(() => null) }
}
/** Gọi GraphQL với tư cách một người dùng mẫu; trả { data, errors, status }. */
export async function as(user, query, variables) {
  const { status, body } = await gqlRaw(await login(user), query, variables, ROLE[user])
  return { status, data: body?.data, errors: body?.errors }
}

export const wait = (ms) => new Promise((r) => setTimeout(r, ms))
export async function until(fn, what, ms = 60_000) {
  const end = Date.now() + ms
  for (;;) {
    const v = await fn()
    if (v) return v
    if (Date.now() > end) throw new Error(`quá hạn chờ: ${what}`)
    await wait(1000)
  }
}

export const uid = () => randomUUID().replace(/-/g, '').slice(0, 8)

export const SPEC = {
  fields: [{ key: 'so_tien', label: 'Số tiền', type: 'number', required: true }],
  steps: [
    { key: 'truong_phong', name: 'Trưởng phòng duyệt', role: 'manager' },
    { key: 'giam_doc', name: 'Giám đốc duyệt', role: 'director', when: { field: 'so_tien', op: '>', value: 5000000 } },
    { key: 'chi_tien', name: 'Kế toán chi tiền', role: 'accountant', type: 'task' },
  ],
}

/** Quản lý xuất bản một quy trình thử và chờ hệ thống sinh xong. */
export async function publishApp(spec = SPEC) {
  const key = `kt_${uid()}`
  const r = await as('manager1', 'mutation($o: app_insert_input!) { insert_app_one(object: $o) { key } }', { o: { key, name: `Kiểm thử ${key}`, spec } })
  if (r.errors) throw new Error(JSON.stringify(r.errors))
  await until(async () => (await as('manager1', 'query($k: String!) { app_by_pk(key: $k) { status } }', { k: key })).data?.app_by_pk?.status === 'published', `quy trình ${key} xuất bản`)
  return key
}
export async function submit(user, appKey, data) {
  return as(user, 'mutation($o: submission_insert_input!) { insert_submission_one(object: $o) { id status } }', { o: { app_key: appKey, data } })
}
export const act = (user, id, step, action, note) =>
  as(user, 'mutation($o: submission_event_insert_input!) { insert_submission_event_one(object: $o) { id } }', { o: { submission_id: id, step_key: step, action, note } })
export const status = async (user, id) =>
  (await as(user, 'query($i: uuid!) { submission_by_pk(id: $i) { status current_step waiting_role } }', { i: id })).data?.submission_by_pk
export const waitStatus = (user, id, want, what) =>
  until(async () => { const s = await status(user, id); return s && Object.entries(want).every(([k, v]) => s[k] === v) ? s : null }, what ?? `hồ sơ ${id} ${JSON.stringify(want)}`)

export const b64u = (o) => Buffer.from(typeof o === 'string' ? o : JSON.stringify(o)).toString('base64url')
