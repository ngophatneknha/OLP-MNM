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
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import https from 'node:https'
import { basename, join } from 'node:path'
import { ROOT, GW, until, run, sql } from './lib.js'

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

describe('OPS: tự phục hồi khi sự cố (đề thi: Zero-Trust gắn với tự phục hồi tức thì)', () => {
  const services = Object.entries(JSON.parse(run('docker', ['compose', 'config', '--format', 'json'])).services).filter(([name]) => name !== 'hasura-init')
  test('OPS-06 mọi dịch vụ chạy lâu của luồng chính có chính sách khởi động lại và kiểm tra sức khỏe', () => {
    for (const [name, svc] of services) {
      assert.ok(['unless-stopped', 'always'].includes(svc.restart), `${name} thiếu restart`)
      assert.ok(svc.healthcheck?.test, `${name} thiếu healthcheck`)
    }
  })
})

describe('OPS: tài nguyên (máy yếu vẫn chạy được bản lõi)', () => {
  test('OPS-08 bản lõi dùng dưới 5 GiB RAM khi nhàn rỗi (đo thật bằng docker stats; scripts/measure.sh in từng dịch vụ)', () => {
    const core = ['postgres', 'keycloak', 'hasura', 'apisix', 'flowable', 'workflow-bridge', 'seaweedfs', 'clamav', 'web']
    const unit = { B: 1 / 1024 ** 2, KiB: 1 / 1024, MiB: 1, GiB: 1024 }
    // Tên container phụ thuộc tên thư mục dự án, nên tra dịch vụ qua docker compose ps thay vì cắt chuỗi tên.
    const service = Object.fromEntries(run('docker', ['compose', 'ps', '--format', '{{.Name}}|{{.Service}}']).trim().split(/\r?\n/).map((l) => l.split('|')))
    const rows = run('docker', ['stats', '--no-stream', '--format', '{{.Name}}|{{.MemUsage}}']).trim().split(/\r?\n/)
      .map((l) => l.split('|')).map(([name, mem]) => [service[name], mem.split('/')[0].trim().match(/^([\d.]+)(\w+)$/)])
      .filter(([name]) => core.includes(name))
    assert.equal(rows.length, core.length, 'thiếu dịch vụ lõi đang chạy')
    const total = rows.reduce((sum, [, m]) => sum + Number(m[1]) * unit[m[2]], 0)
    assert.ok(total < 5 * 1024, `bản lõi dùng ${Math.round(total)} MiB, vượt 5 GiB`)
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

test('OPS-BACKUP sao lưu tự động: dịch vụ backup (profile backup) chạy được một lần, ra đủ ba cơ sở dữ liệu kèm mã băm hợp lệ', { timeout: 180_000 }, () => {
  const root = join(ROOT, 'backups')
  const before = new Set(existsSync(root) ? readdirSync(root) : [])
  const compose = ['compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.optional.yml', '--profile', 'backup']
  let dir
  try {
    run('docker', [...compose, 'run', '--rm', '--no-deps', '-e', 'BACKUP_ONCE=1', '-e', 'BACKUP_KEEP=1000', 'backup'], { stdio: 'pipe' })
    dir = join(root, readdirSync(root).find((d) => !before.has(d)))
    for (const f of ['dxlab.sql.gz', 'keycloak.sql.gz', 'flowable.sql.gz', 'SHA256SUMS']) assert.ok(existsSync(join(dir, f)), f)
    assert.equal(run('sh', ['-c', 'cd "$1" && sha256sum -c SHA256SUMS >/dev/null && gunzip -c dxlab.sql.gz | grep -c "CREATE TABLE public.submission "', 'sh', dir]).trim(), '1')
  } finally {
    // Tệp do container (root) tạo nên dọn bằng chính container, không dọn từ máy chạy kiểm thử (Linux báo EACCES).
    if (dir) run('docker', [...compose, 'run', '--rm', '--no-deps', '--entrypoint', 'rm', 'backup', '-rf', `/backups/${basename(dir)}`], { stdio: 'pipe' })
  }
})

test('OPS-MIGRATE nâng cấp CSDL đang chạy: migrate.sh áp các tệp từ 05 trở đi, chạy lại được; tệp lỗi thì dừng và báo, tệp sau không được áp', { timeout: 180_000 }, () => {
  const out = run('sh', ['scripts/migrate.sh'])
  for (const f of ['05-org.sql', '09-ngsi.sql', '10-stream.sql']) assert.match(out, new RegExp(`Đã áp ${f.replace('.', '\\.')}`))
  assert.doesNotMatch(out, /Đã áp 0[2-4]/, 'không áp lại lược đồ gốc 02..04')
  assert.match(run('sh', ['scripts/migrate.sh']), /Đã áp 10-stream\.sql/, 'chạy lần hai không lỗi')
  assert.equal(sql("SELECT to_regclass('public.ngsi_subscription') IS NOT NULL AND to_regclass('public.stream_published') IS NOT NULL"), 't')
  const dir = mkdtempSync(join(tmpdir(), 'dxlab-migrate-'))
  try {
    writeFileSync(join(dir, '05-hong.sql'), 'SELECT khong_co_cot FROM khong_co_bang;')
    writeFileSync(join(dir, '06-sau.sql'), "CREATE TABLE IF NOT EXISTS ca_thu_migrate (x int);")
    assert.throws(() => run('sh', ['scripts/migrate.sh'], { env: { ...process.env, MIGRATE_DIR: dir }, stdio: 'pipe' }), /Lỗi khi áp 05-hong\.sql/)
    assert.equal(sql("SELECT to_regclass('public.ca_thu_migrate') IS NULL"), 't', 'tệp sau tệp lỗi không được áp')
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('OPS-GITOPS kiểm cấu hình trong kho: lệnh check chạy được; cấu hình hỏng thì bị bắt', { timeout: 120_000 }, () => {
  assert.match(run('sh', ['scripts/gitops.sh', 'check']), /hợp lệ/)
  assert.throws(() => run('sh', ['scripts/gitops.sh', 'bogus'], { stdio: 'pipe' }), 'lệnh lạ phải thất bại')
  assert.throws(() => run('node', ['-e', 'JSON.parse("{")'], { stdio: 'pipe' }))
})
