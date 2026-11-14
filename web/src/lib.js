// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Đăng nhập (Keycloak, PKCE) và gọi GraphQL qua gateway. Cấu hình đọc từ /config.json lúc chạy,
// nên một image dùng được cho mọi môi trường.

import Keycloak from 'keycloak-js'
import { reactive } from 'vue'

export const ROLE_LABEL = { staff: 'Nhân viên', manager: 'Trưởng phòng', director: 'Giám đốc', accountant: 'Kế toán' }
export const STATUS_LABEL = { running: 'Đang xử lý', approved: 'Hoàn tất', rejected: 'Bị từ chối' }

export const auth = reactive({ name: '', userId: '', role: 'staff', roles: [] })
let keycloak
let apiUrl

export async function login() {
  const config = await (await fetch('/config.json')).json()
  apiUrl = config.apiUrl
  keycloak = new Keycloak({ url: config.keycloakUrl, realm: 'dxlab', clientId: 'dxlab-app' })
  await keycloak.init({ onLoad: 'login-required', pkceMethod: 'S256', checkLoginIframe: false })
  const token = keycloak.tokenParsed
  auth.name = token.name || token.preferred_username
  auth.userId = token.sub
  auth.roles = Object.keys(ROLE_LABEL).filter((r) => token.realm_access?.roles.includes(r))
  // Mỗi tài khoản làm việc dưới vai trò chuyên trách của mình; ai cũng có thể gửi hồ sơ.
  auth.role = auth.roles.find((r) => r !== 'staff') ?? 'staff'
}

export const logout = () => keycloak.logout({ redirectUri: location.origin })

export async function gql(query, variables) {
  await keycloak.updateToken(30)
  const res = await fetch(`${apiUrl}/v1/graphql`, {
    method: 'POST',
    headers: { authorization: `Bearer ${keycloak.token}`, 'x-hasura-role': auth.role, 'content-type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  })
  if (res.status === 401) return keycloak.login()
  const json = await res.json()
  if (json.errors) throw new Error(json.errors[0].message)
  return json.data
}

/** "Số tiền tạm ứng" -> "so_tien_tam_ung" (mã hợp lệ cho trường / bước / ứng dụng). */
export function slug(text) {
  const s = text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 31)
  return /^[a-z]/.test(s) ? s : `x_${s}`.slice(0, 31)
}

export const formatValue = (field, value) =>
  value === undefined || value === null || value === '' ? '—'
    : field.type === 'number' ? Number(value).toLocaleString('vi-VN') : String(value)

export const formatTime = (iso) => new Date(iso).toLocaleString('vi-VN', { dateStyle: 'short', timeStyle: 'short' })
