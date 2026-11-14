// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Chờ cả hệ thống sẵn sàng thật sự (đăng nhập được, qua cổng API đọc được dữ liệu, trạm kiểm dịch đã nạp cơ sở dữ liệu
// nhận dạng) trước khi chạy kiểm thử. Dùng: node tests/wait-ready.js [giây tối đa]

import { as, run, wait } from './lib.js'

const limit = Number(process.argv[2] ?? 600) * 1000
const start = Date.now()
const checks = {
  'đăng nhập + cổng API + Hasura': async () => !(await as('manager1', '{ app { key } }')).errors,
  'trạm kiểm dịch ClamAV': async () => run('docker', ['compose', 'ps', 'clamav', '--format', 'json']).includes('"Health":"healthy"'),
  'workflow-bridge': async () => (await as('manager1', '{ library { key } }')).data?.library?.length > 0,
}
for (const [name, ok] of Object.entries(checks)) {
  for (;;) {
    try { if (await ok()) break } catch { /* chưa sẵn sàng */ }
    if (Date.now() - start > limit) { console.error(`Quá hạn chờ: ${name}`); process.exit(1) }
    await wait(3000)
  }
  console.log(`✔ ${name}`)
}
