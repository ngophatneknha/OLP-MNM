// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Vận hành: TLS tại biên (Caddy) và giám sát (Prometheus). Hai thành phần này là tùy chọn (docker-compose.optional.yml),
// nên ca chạy thật chỉ chạy khi đã bật chúng:
//   docker compose -f docker-compose.yml -f docker-compose.optional.yml --profile tls --profile monitoring up -d
//   OPS_OPTIONAL=1 node --test tests/ops.test.js
// Các ca không cần bật gì (script sao lưu, cấu hình) luôn chạy.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import https from 'node:https'
import { join } from 'node:path'
import { ROOT, GW, until } from './lib.js'

const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const skip = process.env.OPS_OPTIONAL ? false : 'đặt OPS_OPTIONAL=1 sau khi bật profile tls và monitoring'
const PROM = process.env.PROMETHEUS_URL ?? 'http://localhost:9092'
const get = (url) => new Promise((ok, fail) => https.get(url, { rejectUnauthorized: false }, (res) => { res.resume(); ok(res) }).on('error', fail))

describe('OPS: sao lưu, khôi phục và cấu hình vận hành', () => {
  test('OPS-01 có script sao lưu và khôi phục, khôi phục kiểm tra mã băm trước khi ghi đè', () => {
    assert.ok(existsSync(join(ROOT, 'scripts/backup.sh')) && existsSync(join(ROOT, 'scripts/restore.sh')))
    assert.match(read('scripts/restore.sh'), /sha256sum -c/)
    for (const db of ['dxlab', 'keycloak', 'flowable']) assert.ok(read('scripts/backup.sh').includes(db), db)
    assert.match(read('docs/VAN_HANH.md'), /scripts\/backup\.sh/)
  })
  test('OPS-02 thành phần tùy chọn không nằm trong luồng chính: compose lõi không công bố cổng TLS hay giám sát', () => {
    const core = read('docker-compose.yml')
    assert.ok(!/^\s*(caddy|prometheus):/m.test(core))
    assert.match(read('docker-compose.optional.yml'), /profiles: \["tls"\]/)
    assert.match(read('docker-compose.optional.yml'), /profiles: \["monitoring"\]/)
  })
})

describe('OPS: thành phần tùy chọn đang chạy', { skip }, () => {
  test('OPS-03 TLS: web, API và đăng nhập đều trả lời qua HTTPS, có HSTS', async () => {
    for (const url of ['https://localhost:8443/', 'https://localhost:9443/v1/graphql', 'https://localhost:8444/realms/dxlab/.well-known/openid-configuration']) {
      const res = await get(url)
      assert.ok(res.statusCode < 500, `${url} trả ${res.statusCode}`)
      assert.ok(res.headers['strict-transport-security'], `${url} thiếu HSTS`)
    }
    // Qua TLS vẫn phải giữ nguyên bảo vệ của cổng: không token thì 401.
    assert.equal((await get('https://localhost:9443/v1/graphql')).statusCode, 401)
  })
  test('OPS-04 giám sát: Prometheus thu được số đo của cổng API và thấy yêu cầu thật', async () => {
    await fetch(`${GW}/v1/graphql`) // một yêu cầu 401 để có số đo
    const targets = await until(async () => {
      const t = (await (await fetch(`${PROM}/api/v1/targets`)).json()).data.activeTargets
      return t.length >= 2 && t.every((x) => x.health === 'up') ? t : null
    }, 'mọi mục tiêu của Prometheus ở trạng thái up', 90_000)
    assert.ok(targets.some((t) => t.labels.job === 'apisix'))
    await until(async () => {
      const r = (await (await fetch(`${PROM}/api/v1/query?query=${encodeURIComponent('sum(apisix_http_status{code="401"})')}`)).json()).data.result
      return r.length && Number(r[0].value[1]) >= 1
    }, 'Prometheus thấy yêu cầu 401', 90_000)
  })
})
