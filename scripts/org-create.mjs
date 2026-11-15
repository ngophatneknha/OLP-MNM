// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Lập tổ chức mới và giám đốc đầu tiên của nó (việc của người vận hành hệ thống, không phải của giám đốc một tổ chức):
//   node scripts/org-create.mjs <mã-tổ-chức> "<Tên tổ chức>" <tên-đăng-nhập-giám-đốc> <mật-khẩu-tạm>
// Thêm dòng vào bảng org (trigger tự tạo vai trò BI bi_<mã>), rồi tạo giám đốc trong Keycloak với claim org_id.
// Sau đó giám đốc đó tự thêm người khác ở mục "Người dùng tổ chức" trên web. Cần hệ thống đang chạy và .env có khóa quản trị Keycloak.
// Chạy trên máy có Docker và Node.js 22 (không cần cài gói).
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const [id, name, username, password] = process.argv.slice(2)
if (!/^[a-z][a-z0-9_-]{1,30}$/.test(id ?? '') || !name?.trim() || !/^[a-z][a-z0-9._-]{2,30}$/.test(username ?? '') || (password ?? '').length < 8) {
  console.error('Dùng: node scripts/org-create.mjs <mã-tổ-chức> "<Tên>" <tên-đăng-nhập-giám-đốc> <mật-khẩu-tạm từ 8 ký tự>')
  process.exit(2)
}
const env = Object.fromEntries(readFileSync(join(ROOT, '.env'), 'utf8').split(/\r?\n/).filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1)]))
const KC = process.env.KC_URL ?? 'http://localhost:8081'
const q = (v) => `'${v.replaceAll("'", "''")}'`

execFileSync('docker', ['compose', 'exec', '-T', 'postgres', 'psql', '-U', env.POSTGRES_USER, '-d', env.POSTGRES_DB ?? 'dxlab', '-v', 'ON_ERROR_STOP=1', '-c', `INSERT INTO org (id, name) VALUES (${q(id)}, ${q(name.trim())})`], { cwd: ROOT, stdio: 'inherit' })

const tok = await (await fetch(`${KC}/realms/master/protocol/openid-connect/token`, { method: 'POST', body: new URLSearchParams({ grant_type: 'password', client_id: 'admin-cli', username: env.KEYCLOAK_ADMIN, password: env.KEYCLOAK_ADMIN_PASSWORD }) })).json()
const kc = (path, init = {}) => fetch(`${KC}/admin/realms/dxlab${path}`, { ...init, headers: { authorization: `Bearer ${tok.access_token}`, 'content-type': 'application/json' } })
const created = await kc('/users', { method: 'POST', body: JSON.stringify({ username, enabled: true, firstName: 'Giám đốc', lastName: name.trim(), attributes: { org_id: [id] }, credentials: [{ type: 'password', value: password, temporary: true }] }) })
if (!created.ok) { console.error(`Keycloak từ chối tạo người dùng (${created.status}): ${await created.text()}`); process.exit(1) }
const uid = created.headers.get('location').split('/').pop()
const roles = await Promise.all(['staff', 'director'].map(async (r) => (await kc(`/roles/${r}`)).json()))
await kc(`/users/${uid}/role-mappings/realm`, { method: 'POST', body: JSON.stringify(roles) })
console.log(`Đã lập tổ chức ${id} (${name}) và giám đốc ${username} (đổi mật khẩu ở lần đăng nhập đầu).`)
