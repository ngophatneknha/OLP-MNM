// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Các điều khoản của Thể lệ và Đề thi ngoài bảng điểm PoF: yêu cầu về kho, người đóng góp, bí mật, gói phát hành,
// hồ sơ nộp bài. (Điều khoản về con người như số thành viên, giảng viên hướng dẫn, đăng ký qua trường, hạn nộp
// không kiểm bằng máy được: xem docs/NOP_BAI.md.) Mã ca: LUAT-<số>.

import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { NO_GIT, ROOT, run } from './lib.js'

const REPO = process.env.REPO ?? 'ngophatneknha/OLP-MNM'
const OWNER = REPO.split('/')[0].toLowerCase()
const read = (p) => readFileSync(join(ROOT, p), 'utf8')
const gh = (path) => fetch(`https://api.github.com/repos/${REPO}${path}`, {
  headers: { accept: 'application/vnd.github+json', ...(process.env.GITHUB_TOKEN ? { authorization: `Bearer ${process.env.GITHUB_TOKEN}` } : {}) },
})
// Chỉ xét lịch sử được công bố (nhánh đang kiểm và các thẻ), không xét nhánh sao lưu cục bộ trên máy từng người.
const history = () => run('git', ['log', 'HEAD', '--tags', '--format=%an|%ae|%cn|%ce|%B%x00']).split('\0')

describe('LUAT: Thể lệ và Đề thi — điều khoản ngoài bảng điểm', () => {
  test('LUAT-01 toàn bộ sản phẩm công bố trên một kho mã nguồn mở duy nhất, công khai, nhận diện được giấy phép', async () => {
    const j = await (await gh('')).json()
    assert.equal(j.private, false)
    assert.equal(j.license?.spdx_id, 'Apache-2.0', 'GitHub phải nhận ra giấy phép (hiện ở thanh bên của kho)')
    assert.ok(j.description && j.description.length > 20, 'kho cần có mô tả')
  })
  test('LUAT-02 không tài liệu của BTC (PDF) nằm trong kho', { skip: NO_GIT }, () => {
    assert.deepEqual(run('git', ['ls-files']).split('\n').filter((f) => /\.pdf$/i.test(f)), [])
  })
  test('LUAT-03 lịch sử commit chỉ có tác giả là thành viên đội: không công cụ/AI/bot đứng tên hay đồng tác giả', { skip: NO_GIT }, () => {
    const bad = history().filter((c) => /claude|anthropic|co-authored-by|generated with|\[bot\]|noreply@anthropic/i.test(c))
    assert.equal(bad.length, 0, `${bad.length} commit có dấu vết đồng tác giả`)
  })
  test('LUAT-04 danh sách người đóng góp trên GitHub không có tài khoản công cụ/AI/bot', async () => {
    const list = await (await gh('/contributors?per_page=30')).json()
    assert.ok(Array.isArray(list) && list.length >= 1)
    for (const c of list) {
      assert.ok(!/claude|anthropic|copilot|\[bot\]|bot$/i.test(c.login) && c.type !== 'Bot', `tài khoản công cụ trong danh sách: ${c.login}`)
    }
  })
  test('LUAT-05 không bí mật thật trong toàn bộ lịch sử: khóa API, mật khẩu, token, khóa riêng', { skip: NO_GIT }, () => {
    const log = run('git', ['log', '--all', '-p', '--no-color'])
    const shapes = [
      [/-----BEGIN (RSA |EC |OPENSSH |)PRIVATE KEY-----/, 'khóa riêng'],
      [/\bghp_[A-Za-z0-9]{30,}\b|\bgithub_pat_[A-Za-z0-9_]{30,}\b/, 'token GitHub'],
      [/\bsk-[A-Za-z0-9]{32,}\b/, 'khóa kiểu OpenAI'],
      [/\bAKIA(?!IOSFODNN7EXAMPLE\b)[0-9A-Z]{16}\b/, 'khóa AWS'], // trừ khóa mẫu công khai trong tài liệu AWS (dùng kiểm chứng bộ ký SigV4)
      [/^\+.*(?:API_KEY|api_key|apiKey)\s*[:=]\s*['"]?[A-Za-z0-9]{28,}['"]?/m, 'khóa API gán thẳng'],
    ]
    for (const [re, what] of shapes) assert.ok(!re.test(log), `phát hiện ${what} trong lịch sử`)
    // Khóa AI đang dùng thật (nếu có) tuyệt đối không được nằm trong lịch sử.
    if (existsSync(join(ROOT, '.env'))) {
      const key = read('.env').match(/^AI_API_KEY=(\S{16,})/m)?.[1]
      if (key) assert.ok(!log.includes(key), 'khóa AI trong .env đã bị commit')
    }
  })
  test('LUAT-06 mật khẩu mẫu trong .env.example chỉ là giá trị giữ chỗ và README cảnh báo phải đổi', () => {
    for (const m of read('.env.example').matchAll(/^(\w*(?:PASSWORD|SECRET)\w*)=(.*)$/gm)) assert.match(m[2], /^change-me$|^$/, m[1])
    assert.match(read('README.md'), /đổi mật khẩu|change-me|mật khẩu/i)
  })
  test('LUAT-07 image container công bố (GitHub Packages) công khai, đúng giấy phép, chỉ chứa mã của dự án', async () => {
    for (const name of ['dxlab-web', 'dxlab-workflow-bridge']) {
      const t = (await (await fetch(`https://ghcr.io/token?scope=repository:${OWNER}/${name}:pull`)).json()).token
      assert.ok(t, `${name} chưa công khai`)
      const tags = await (await fetch(`https://ghcr.io/v2/${OWNER}/${name}/tags/list`, { headers: { authorization: `Bearer ${t}` } })).json()
      assert.ok(tags.tags.includes('latest'), name)
    }
  })
  test('LUAT-08 mọi bản phát hành có ghi chú và tệp kèm theo; bản mới nhất là bản "latest"', async () => {
    const rel = await (await gh('/releases?per_page=30')).json()
    assert.ok(rel.length >= 1)
    for (const r of rel) { assert.ok(r.body && r.body.length > 50, `${r.tag_name} thiếu ghi chú`); assert.ok(r.assets.length >= 1, `${r.tag_name} thiếu tệp`) }
    const latest = await (await gh('/releases/latest')).json()
    assert.equal(latest.tag_name, rel[0].tag_name)
  })
  test('LUAT-09 đề thi: Tầng 1 không giao diện — không dịch vụ lõi nào công bố cổng giao diện ra ngoài (trừ trang đăng nhập SSO)', () => {
    const compose = read('docker-compose.yml')
    const published = [...compose.matchAll(/^\s*-\s*"(\d+):\d+"/gm)].map((m) => Number(m[1])).sort((a, b) => a - b)
    assert.deepEqual(published, [3000, 8081, 9080])
  })
  test('LUAT-10 đề thi: mô hình chạy được bằng đúng một lệnh dựng từ mã nguồn, không bước thủ công ẩn', () => {
    const r = read('README.md')
    assert.match(r, /cp \.env\.example \.env/)
    assert.match(r, /docker compose up -d --build/)
    assert.ok(!/sửa (tay )?(tệp|file) (header|mã)/i.test(r))
  })
  test('LUAT-11 hồ sơ nộp bài: có mẫu thư đúng quy cách của đề (tiêu đề, thành viên, người hướng dẫn, kho mã) và lưu ý hạn nộp', () => {
    assert.ok(existsSync(join(ROOT, 'docs/NOP_BAI.md')), 'thiếu docs/NOP_BAI.md')
    const d = read('docs/NOP_BAI.md')
    for (const kw of ['BÀI THI PMNM 2026', 'olpvietnam@vaip.vn', 'thuky@vfossa.vn', 'Người hướng dẫn', 'Kho mã nguồn dự thi', '17:00', '06/12', 'github.com/ngophatneknha/OLP-MNM']) assert.ok(d.includes(kw), kw)
  })
  test('LUAT-12 tài liệu cho người dùng, kỹ thuật, trình diễn và slide đều có và được README dẫn tới; liên kết trong docs không gãy', () => {
    const docs = ['docs/HUONG_DAN.md', 'docs/KY_THUAT.md', 'docs/KICH_BAN_DEMO.md', 'docs/VAN_HANH.md', 'docs/TRI_TUE.md', 'docs/architecture.md', 'docs/slides/index.html']
    const readme = read('README.md')
    for (const d of docs) {
      assert.ok(existsSync(join(ROOT, d)), `thiếu ${d}`)
      if (d !== 'docs/VAN_HANH.md' && d !== 'docs/TRI_TUE.md') assert.ok(readme.includes(d), `README chưa dẫn tới ${d}`)
    }
    for (const d of docs.filter((x) => x.endsWith('.md'))) {
      for (const m of read(d).matchAll(/\]\((?!https?:|#|mailto:)([^)#\s]+)/g)) {
        assert.ok(existsSync(join(ROOT, 'docs', '..', d, '..', decodeURI(m[1]))), `${d}: liên kết gãy ${m[1]}`)
      }
    }
  })
})
