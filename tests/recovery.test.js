// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Tự phục hồi thật: làm một dịch vụ thoát đột ngột thì Docker phải tự chạy lại và dịch vụ phải khỏe trở lại.
// Chạy riêng (làm gián đoạn dịch vụ trong vài giây nên không chạy chung với các tệp kiểm thử khác):
//   RECOVERY_TEST=1 node --test tests/recovery.test.js
// Lưu ý: `docker kill` tính là dừng thủ công nên Docker không chạy lại; ca này mô phỏng sự cố bằng cách để tiến trình chính tự thoát.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { run, until } from './lib.js'

const skip = process.env.RECOVERY_TEST ? false : 'đặt RECOVERY_TEST=1 để chạy (làm gián đoạn dịch vụ vài giây)'
const state = (svc) => {
  const id = run('docker', ['compose', 'ps', '-a', '-q', svc]).trim()
  const [started, health] = run('docker', ['inspect', '-f', '{{.State.StartedAt}} {{.State.Health.Status}}', id]).trim().split(' ')
  return { started, health }
}

describe('OPS-07 tự phục hồi khi tiến trình chính thoát', { skip }, () => {
  for (const [svc, crash] of [['web', ['nginx', '-s', 'quit']], ['seaweedfs', ['sh', '-c', 'kill 1']]]) {
    test(`${svc} thoát đột ngột thì tự chạy lại và khỏe`, async () => {
      const before = state(svc).started
      run('docker', ['compose', 'exec', '-T', svc, ...crash])
      await until(() => { const s = state(svc); return s.started !== before && s.health === 'healthy' }, `${svc} tự chạy lại`, 120_000)
    })
  }
})
