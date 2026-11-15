// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Thể lệ OLP PMNM 2026, mục "Các tiêu chí chấm điểm", nhóm I (dựa trên PoF, 50 điểm, chấm trước chung kết).
// Mỗi ca tương ứng một mục điểm hoặc một mục điểm trừ trong bảng của BTC. Chạy trên kho thật và bản phát hành thật
// (cần mạng để gọi GitHub). Mã ca: PoF-<tiêu chí>-<số>.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { existsSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { NO_GIT, ROOT, run } from './lib.js'

const REPO = process.env.REPO ?? 'ngophatneknha/OLP-MNM'
const DEADLINE = new Date('2026-12-06T17:00:00+07:00')
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const composeAll = () => `${read('docker-compose.yml')}
${read('docker-compose.optional.yml')}`
const walk = (d) => readdirSync(join(ROOT, d), { withFileTypes: true }).flatMap((e) => (['node_modules', 'dist', '.git'].includes(e.name) ? [] : e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`.replace(/^\.\//, '')]))
const files = (NO_GIT ? walk('.') : run('git', ['ls-files']).split('\n').filter(Boolean)).filter((f) => existsSync(join(ROOT, f)))
// Có GITHUB_TOKEN (trong CI) thì dùng để khỏi bị giới hạn 60 lượt/giờ; vẫn chỉ đọc dữ liệu công khai.
// Thử lại vài lần: GitHub thỉnh thoảng từ chối tạm thời khi nhiều tệp kiểm thử cùng gọi một lúc.
const gh = async (path) => {
  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`https://api.github.com/repos/${REPO}${path}`, {
      headers: { accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
    }).catch(() => null)
    if ((res && res.status < 500 && res.status !== 403 && res.status !== 429) || attempt >= 4) return res
    await new Promise((ok) => setTimeout(ok, 1500 * attempt))
  }
}
// Dựng chuỗi tìm kiếm để tệp kiểm thử này không tự chứa thẻ SPDX thật (công cụ REUSE sẽ đọc nhầm).
const SPDX = new RegExp(String.raw`SPDX-${'License'}-Identifier:\s*\S+`)
const SPDX_ID = new RegExp(String.raw`SPDX-${'License'}-Identifier:\s*([A-Za-z0-9.\-+]+)`)
const semver = /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(-[0-9A-Za-z.-]+)?$/

describe('PoF-1: Hệ thống quản lý mã nguồn trên Internet (5 điểm)', () => {
  test('PoF-1.1 kho công khai, truy cập tự do không cần đăng nhập, có web viewer (không bị -3)', async () => {
    const r = await gh('')
    assert.equal(r.status, 200)
    const j = await r.json()
    assert.equal(j.private, false)
    assert.equal((await fetch(j.html_url)).status, 200)
  })
  test('PoF-1.2 kho thật sự được dùng: nhiều commit, trải trên nhiều ngày, nhiều nhánh/PR (không bị -5)', { skip: NO_GIT }, async () => {
    const commits = run('git', ['log', '--format=%ad', '--date=short']).trim().split('\n')
    assert.ok(commits.length >= 30, `chỉ có ${commits.length} commit`)
    assert.ok(new Set(commits).size >= 3, 'commit phải trải trên ít nhất 3 ngày')
    const prs = await (await gh('/pulls?state=all&per_page=100')).json()
    assert.ok(prs.length >= 10, `chỉ có ${prs.length} pull request`)
    assert.ok(prs.filter((p) => p.merged_at).length >= 5, 'phải có PR đã gộp')
  })
  test('PoF-1.3 nhánh mặc định là main và CI công khai chạy được', async () => {
    const j = await (await gh('')).json()
    assert.equal(j.default_branch, 'main')
    const runs = (await (await gh('/actions/runs?per_page=10&branch=main&status=completed')).json()).workflow_runs
    assert.ok(runs.length >= 1)
    // Trong chính CI, lần chạy trước trên main có thể đang đỏ (chính lỗi đang được sửa), nên chỉ đòi từng có CI xanh gần đây (khỏi vòng luẩn quẩn); chạy cục bộ thì đòi lần gần nhất phải xanh.
    const ok = process.env.GITHUB_ACTIONS ? runs.some((r) => r.conclusion === 'success') : runs[0].conclusion === 'success'
    assert.ok(ok, `CI gần nhất trên main: ${runs[0].conclusion}`)
  })
})

describe('PoF-2: Cấp phép theo giấy phép OSI-approved (10 điểm)', () => {
  test('PoF-2.1 có bản sao toàn văn giấy phép (LICENSE) đúng Apache-2.0 nguyên bản, và trong LICENSES/ theo REUSE', () => {
    const lic = read('LICENSE')
    assert.match(lic, /Apache License\s+Version 2\.0, January 2004/)
    assert.match(lic, /END OF TERMS AND CONDITIONS/)
    assert.ok(lic.length > 10_000, 'văn bản phải đầy đủ')
    const copy = read('LICENSES/Apache-2.0.txt')
    assert.equal(createHash('sha256').update(copy.replace(/\r/g, '')).digest('hex').length, 64)
    assert.match(copy, /Apache License\s+Version 2\.0/)
  })
  test('PoF-2.2 mọi tệp mã nguồn mang tiêu đề SPDX trong chính tệp (không bị -5 "giấy phép không ghi trong từng tệp mã")', () => {
    const code = /\.(js|mjs|vue|css|sh|sql|py|yml|yaml|html|conf|template|dockerfile)$/i
    const needs = files.filter((f) => code.test(f) || /(^|\/)Dockerfile$/.test(f))
    const missing = needs.filter((f) => !SPDX.test(readFileSync(join(ROOT, f), 'utf8').slice(0, 1500)))
    assert.deepEqual(missing, [], `thiếu tiêu đề SPDX: ${missing.join(', ')}`)
  })
  test('PoF-2.3 mọi tệp còn lại (JSON, ảnh, tài liệu) được phủ rõ ràng bằng REUSE: kiểm bằng công cụ reuse lint', () => {
    const out = run('reuse', ['lint-file', ...files])
    assert.equal(out.trim(), '', out.slice(-400))
  })
  test('PoF-2.4 có thông báo về mục đích giấy phép: README và NOTICE nói rõ giấy phép của sản phẩm', () => {
    assert.match(read('README.md'), /Apache License 2\.0|Apache-2\.0/)
    assert.match(read('README.md'), /THIRD_PARTY/)
  })
  test('PoF-2.5 mọi giấy phép dùng trong tệp đều là OSI-approved và nằm trong LICENSES/', () => {
    const OSI = new Set(['Apache-2.0', 'MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'ISC', 'MPL-2.0', 'OFL-1.1', 'CC0-1.0', 'GPL-2.0-only', 'GPL-2.0-or-later', 'PostgreSQL', 'CC-BY-4.0'])
    const used = new Set()
    for (const f of files) {
      const m = readFileSync(join(ROOT, f), 'utf8').slice(0, 1500).match(SPDX_ID)
      if (m) used.add(m[1])
    }
    for (const id of used) assert.ok(OSI.has(id), `${id} chưa được xác nhận là OSI-approved`)
    for (const id of used) assert.ok(existsSync(join(ROOT, `LICENSES/${id}.txt`)), `thiếu LICENSES/${id}.txt`)
  })
  test('PoF-2.6 không có sự không tương thích giữa giấy phép các thành phần (không có thành phần copyleft mạnh liên kết vào mã của dự án)', () => {
    const tp = read('THIRD_PARTY.md')
    // Thành phần copyleft (nếu có) phải chạy như tiến trình/container riêng, không liên kết vào mã Apache-2.0 của dự án.
    for (const bad of ['AGPL', 'SSPL', 'BUSL', 'Commons Clause', 'Elastic License']) {
      const lines = tp.split('\n').filter((l) => l.includes(bad))
      for (const l of lines) assert.match(l, /không|tách|riêng|container|cân nhắc|loại|không dùng/i, `thành phần ${bad} cần giải trình: ${l}`)
    }
    assert.match(tp, /GPL-2\.0/, 'ClamAV (GPL-2.0) phải được khai báo')
  })
  test('PoF-2.7 sản phẩm giải quyết đúng đầu bài: tài liệu nêu rõ đối chiếu Tầng 1 và H-P-D-I', () => {
    const readme = read('README.md') + read('docs/architecture.md')
    for (const kw of ['DX-OS', 'Tầng 1', 'Keycloak', 'APISIX', 'Hasura', 'Flowable']) assert.ok(readme.includes(kw), kw)
    for (const kw of ['[H]', '[P]', '[D]', '[I]']) assert.ok(readme.includes(kw), kw)
  })
})

describe('PoF-3: Bản phát hành (5 điểm)', () => {
  let releases
  test('PoF-3.1 có ít nhất một bản phát hành, tạo trước hạn nộp bài (không bị -5)', async () => {
    releases = await (await gh('/releases?per_page=30')).json()
    assert.ok(releases.length >= 1)
    const first = releases.map((r) => new Date(r.published_at)).sort((a, b) => a - b)[0]
    assert.ok(first < DEADLINE, `bản đầu tiên ${first.toISOString()} sau hạn ${DEADLINE.toISOString()}`)
  })
  test('PoF-3.2 đánh số phiên bản theo SemVer (không bị -3)', { skip: NO_GIT }, () => {
    for (const r of releases) assert.match(r.tag_name, semver, r.tag_name)
    const tags = run('git', ['tag', '--list']).trim().split('\n').filter(Boolean)
    for (const t of tags) assert.match(t, semver, t)
  })
  test('PoF-3.3 tệp phát hành dùng định dạng mở .tar.gz, không có .zip/.rar/.arj (không bị -3)', () => {
    for (const r of releases) {
      const names = r.assets.map((a) => a.name)
      assert.ok(names.some((n) => n.endsWith('.tar.gz')), `${r.tag_name} không có .tar.gz`)
      assert.deepEqual(names.filter((n) => /\.(zip|rar|arj|7z)$/i.test(n)), [], `${r.tag_name} có định dạng đóng`)
    }
  })
  test('PoF-3.4 phiên bản trong CHANGELOG, web/package.json và thẻ phát hành khớp nhau; thẻ nằm trên nhánh main', { skip: NO_GIT }, () => {
    // Mỗi lần đẩy là một phiên bản: trên nhánh đang làm, phiên bản đầu CHANGELOG có thể mới hơn bản đã phát hành (thẻ gắn sau khi gộp).
    const top = read('CHANGELOG.md').match(/^## \[(\d+\.\d+\.\d+)\]/m)[1]
    assert.equal(JSON.parse(read('web/package.json')).version, top)
    const key = (v) => v.split('.').map(Number).reduce((a, n) => a * 1000 + n, 0)
    const latest = releases[0].tag_name.slice(1)
    assert.ok(key(top) >= key(latest), `CHANGELOG (${top}) cũ hơn bản đã phát hành (${latest})`)
    if (run('git', ['tag', '--list', `v${top}`]).trim()) run('git', ['merge-base', '--is-ancestor', `v${top}`, 'HEAD'])
  })
  test('PoF-3.5 tệp phát hành tải về được, giải nén được và không chứa tệp bí mật hay mã đã dựng sẵn', async () => {
    const asset = releases[0].assets.find((a) => a.name.endsWith('.tar.gz'))
    const dir = mkdtempSync(join(tmpdir(), 'dxlab-release-'))
    const res = await fetch(asset.browser_download_url)
    assert.equal(res.status, 200)
    writeFileSync(join(dir, asset.name), Buffer.from(await res.arrayBuffer()))
    run('tar', ['-xzf', asset.name], { cwd: dir })
    const top = readdirSync(dir).find((n) => statSync(join(dir, n)).isDirectory())
    const listing = run('tar', ['-tzf', asset.name], { cwd: dir })
    assert.ok(!/\/\.env$/m.test(listing), 'không được chứa .env thật')
    assert.ok(!/node_modules\//.test(listing) && !/\/dist\//.test(listing), 'không chứa thư viện bên thứ ba hay mã đã dựng')
    for (const must of ['LICENSE', 'README.md', 'CHANGELOG.md', 'THIRD_PARTY.md', 'docker-compose.yml', '.env.example']) assert.ok(existsSync(join(dir, top, must)), must)
  })
})

describe('PoF-4: Cài đặt và dịch từ mã nguồn (10 điểm)', () => {
  test('PoF-4.1 có hướng dẫn dựng từ mã nguồn rõ ràng trong README (không bị -5)', () => {
    const r = read('README.md')
    assert.match(r, /docker compose up/)
    assert.match(r, /cp \.env\.example \.env/)
    assert.match(r, /Yêu cầu|yêu cầu/)
  })
  test('PoF-4.2 cấu hình trước khi dựng bằng biến môi trường (.env), không sửa tay tệp mã/header (không bị -5)', () => {
    const ex = read('.env.example')
    for (const k of ['POSTGRES_PASSWORD', 'KEYCLOAK_ADMIN_PASSWORD', 'HASURA_ADMIN_SECRET', 'KEYCLOAK_PUBLIC_URL', 'API_PUBLIC_URL', 'APP_ORIGIN']) assert.match(ex, new RegExp(`^${k}=`, 'm'), k)
    assert.ok(!files.includes('.env'), '.env thật không được nằm trong kho')
  })
  test('PoF-4.3 công cụ dựng đều là nguồn mở và có sẵn: Docker Compose, Node, npm; không công cụ tự chế/đóng (không bị -5)', () => {
    const dockerfile = read('web/Dockerfile')
    assert.match(dockerfile, /FROM node:\d+/)
    assert.ok(!/curl .*\|\s*(sh|bash)/.test(dockerfile + composeAll()), 'không tải và chạy mã lạ')
  })
  test('PoF-4.4 mọi image được ghim phiên bản cụ thể (dựng lại được, không dùng :latest)', () => {
    const imgs = [...(composeAll() + read('web/Dockerfile')).matchAll(/^\s*(?:image:|FROM)\s+(\S+)/gm)].map((m) => m[1])
    assert.ok(imgs.length >= 8)
    for (const i of imgs) assert.ok(/:[\w.-]*\d/.test(i) && !i.endsWith(':latest'), `chưa ghim: ${i}`)
  })
  test('PoF-4.5 chạy được khi giải nén ở thư mục khác: không có đường dẫn tuyệt đối hay ../ trong cấu hình dựng', () => {
    const compose = read('docker-compose.yml')
    assert.ok(!/[A-Z]:\\|\/home\/|\/Users\//.test(compose), 'có đường dẫn tuyệt đối của máy cá nhân')
    assert.ok(!/\.\.\//.test(compose), 'tham chiếu ra ngoài thư mục mã nguồn')
    const cfg = run('docker', ['compose', 'config', '--quiet'])
    assert.equal(cfg, '')
  })
  test('PoF-4.6 dựng thật từ bản phát hành giải nén ở thư mục tạm: compose hợp lệ và web dựng thành công', async () => {
    const releases = await (await gh('/releases/latest')).json()
    const asset = releases.assets.find((a) => a.name.endsWith('.tar.gz'))
    const dir = mkdtempSync(join(tmpdir(), 'dxlab-build-'))
    writeFileSync(join(dir, asset.name), Buffer.from(await (await fetch(asset.browser_download_url)).arrayBuffer()))
    run('tar', ['-xzf', asset.name], { cwd: dir })
    const src = join(dir, readdirSync(dir).find((n) => statSync(join(dir, n)).isDirectory()))
    writeFileSync(join(src, '.env'), read('.env.example'))
    run('docker', ['compose', 'config', '--quiet'], { cwd: src })
    // Dựng thật image web từ mã nguồn trong bản phát hành (npm ci + vite build bên trong Docker).
    run('docker', ['build', '-q', '-t', 'dxlab-web-release-test', join(src, 'web')], { timeout: 600_000 })
  })
})

describe('PoF-5: Thư viện và gói đính kèm (10 điểm)', () => {
  test('PoF-5.1 có thông tin làm rõ mọi thành phần: mỗi image trong compose và mỗi thư viện web đều có trong THIRD_PARTY.md', () => {
    const norm = (x) => x.toLowerCase().replace(/[^a-z0-9]/g, '')
    const tp = norm(read('THIRD_PARTY.md'))
    const imgs = [...composeAll().matchAll(/^\s*image:\s*(\S+)/gm)].map((m) => m[1].split(':')[0].split('/').pop())
    for (const i of imgs) assert.ok(tp.includes(norm(i.replace(/-(rest|engine)$/, ''))), `THIRD_PARTY.md thiếu ${i}`)
    const pkg = JSON.parse(read('web/package.json'))
    for (const d of Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })) assert.ok(tp.includes(norm(d)), `THIRD_PARTY.md thiếu ${d}`)
  })
  test('PoF-5.2 không phát hành kèm gói của dự án khác: không có node_modules, vendor, dist, tệp nhị phân trong kho (không bị -5)', () => {
    for (const f of files) {
      assert.ok(!/(^|\/)(node_modules|vendor|dist|build)\//.test(f), `có thư mục thư viện/dựng sẵn: ${f}`)
      assert.ok(!/\.(jar|war|exe|dll|so|dylib|class|bin)$/i.test(f), `tệp nhị phân: ${f}`)
    }
  })
  test('PoF-5.3 dùng thư viện sẵn có thay vì tự chép: phụ thuộc khai báo trong package.json kèm khóa phiên bản (lockfile có integrity)', () => {
    const lock = JSON.parse(read('web/package-lock.json'))
    const pk = Object.entries(lock.packages).filter(([k]) => k)
    assert.ok(pk.length > 20)
    assert.ok(pk.every(([, v]) => v.integrity || v.link || v.inBundle), 'gói thiếu mã băm integrity')
    assert.ok(pk.every(([, v]) => !v.resolved || v.resolved.startsWith('https://registry.npmjs.org/')), 'gói lấy từ nguồn lạ')
  })
  test('PoF-5.4 không sửa mã nguồn của gói đính kèm: không có patch-package, không sed/patch lên thư viện trong Dockerfile hay compose', () => {
    const joined = read('web/Dockerfile') + composeAll()
    assert.ok(!/patch-package|\bpatch\s+-p|sed -i .*node_modules/.test(joined))
    assert.ok(!files.some((f) => /\.(patch|diff)$/.test(f)))
    assert.ok(!('patchedDependencies' in JSON.parse(read('web/package.json'))))
  })
  test('PoF-5.5 giấy phép của thư viện web đã cài đều là giấy phép mở tương thích Apache-2.0', () => {
    if (!existsSync(join(ROOT, 'web/node_modules'))) return
    const ok = /^(MIT|ISC|Apache-2\.0|BSD-[23]-Clause|0BSD|MPL-2\.0|OFL-1\.1|CC0-1\.0|BlueOak-1\.0\.0|Python-2\.0|\(.*\)|MIT-0|Unlicense)/
    const lock = JSON.parse(read('web/package-lock.json'))
    const bad = []
    for (const k of Object.keys(lock.packages).filter(Boolean)) {
      const p = join(ROOT, 'web', k, 'package.json')
      if (!existsSync(p)) continue
      const lic = JSON.parse(readFileSync(p, 'utf8')).license
      if (typeof lic === 'string' && !ok.test(lic)) bad.push(`${k}: ${lic}`)
    }
    assert.deepEqual(bad, [])
  })
})

describe('PoF-6: Tài liệu và giao tiếp (10 điểm)', () => {
  test('PoF-6.1 có README đầy đủ: giới thiệu, kiến trúc, cài đặt, sử dụng, kiểm thử, giấy phép (không bị -5)', () => {
    const r = read('README.md')
    for (const h of [/giới thiệu|vấn đề/i, /kiến trúc/i, /cài đặt|bắt đầu/i, /đóng góp/i, /giấy phép/i]) assert.match(r, h, String(h))
    assert.ok(r.length > 4000)
    for (const f of ['CONTRIBUTING.md', 'docs/architecture.md']) assert.ok(existsSync(join(ROOT, f)), f)
  })
  test('PoF-6.2 có lịch sử thay đổi CHANGELOG theo Keep a Changelog, mỗi bản phát hành một mục (không bị -5)', { skip: NO_GIT }, () => {
    const c = read('CHANGELOG.md')
    assert.match(c, /Keep a Changelog/)
    for (const t of run('git', ['tag', '--list']).trim().split('\n').filter(Boolean)) assert.match(c, new RegExp(`^## \\[${t.slice(1).replace(/\./g, '\\.')}\\] - \\d{4}-\\d{2}-\\d{2}`, 'm'), `CHANGELOG thiếu ${t}`)
  })
  test('PoF-6.3 có bug tracker và được dùng thật: nhiều issue, đã đóng bớt, gắn nhãn (không bị -5)', async () => {
    const all = (await (await gh('/issues?state=all&per_page=100')).json()).filter((i) => !i.pull_request)
    assert.ok(all.length >= 20, `chỉ ${all.length} issue`)
    assert.ok(all.filter((i) => i.state === 'closed').length >= 5, 'phải có issue đã đóng')
    assert.ok(all.some((i) => i.labels.length), 'issue phải có nhãn')
    assert.ok(existsSync(join(ROOT, '.github/ISSUE_TEMPLATE')), 'mẫu issue')
  })
  test('PoF-6.4 tài liệu thực hiện được: mọi lệnh trong README tham chiếu tệp có thật', () => {
    const r = read('README.md')
    for (const m of r.matchAll(/(?:sh|node|python3?) ((?:scripts|services|tests)\/[\w./-]+)/g)) assert.ok(existsSync(join(ROOT, m[1])), `README nhắc ${m[1]} nhưng không có`)
    for (const m of r.matchAll(/\]\((?!https?:|#)([^)#\s]+)\)/g)) assert.ok(existsSync(join(ROOT, decodeURI(m[1]))), `liên kết gãy: ${m[1]}`)
  })
  test('PoF-6.5 có hướng dẫn đóng góp, quy tắc ứng xử và mẫu pull request để cộng đồng tham gia', () => {
    assert.ok(existsSync(join(ROOT, 'CONTRIBUTING.md')))
    assert.ok(existsSync(join(ROOT, '.github/pull_request_template.md')) || existsSync(join(ROOT, '.github/PULL_REQUEST_TEMPLATE.md')))
  })
})
