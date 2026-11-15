// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Điểm trưởng thành H-P-D-I của tổ chức (0 đến 100), tính từ dữ liệu sử dụng thật, không nhập tay.
// Đây là thang điểm của dự án (công thức công bố ở docs/HUONG_DAN.md), không phải chuẩn công nghiệp.
// Hàm thuần, có kiểm thử: maturity.test.js.

import { applies } from './flow.js'
import { stepWaits } from './metrics.js'

export const MIN_SUBMISSIONS = 5 // dưới ngưỡng này thì chưa đủ dữ liệu để chấm
const WAIT_LIMIT_HOURS = 48
const MIN_SAMPLE_PER_PROCESS = 5

const ratio = (n, d) => (d ? n / d : null)

/** Trung bình có trọng số của các thành phần có dữ liệu; không thành phần nào có dữ liệu thì null. */
function combine(parts) {
  const have = parts.filter((p) => p.value !== null)
  const weight = have.reduce((s, p) => s + p.weight, 0)
  if (!weight) return { score: null, parts }
  return { score: Math.round((have.reduce((s, p) => s + p.weight * p.value, 0) / weight) * 100), parts }
}

/** "Khởi đầu" dưới 40, "Đang phát triển" từ 40, "Trưởng thành" từ 70. */
export const maturityLevel = (score) => (score === null ? 'none' : score >= 70 ? 'mature' : score >= 40 ? 'growing' : 'start')

/**
 * @param submissions hồ sơ kèm app { key }, version { spec }, app_version, data, status, events, opinions
 * @param apps quy trình đã phát hành kèm spec, versions [{ version }], changes [{ status }]
 * @param autonomy [{ app_key, step_key, level }]
 */
export function computeMaturity({ submissions, apps, autonomy }) {
  if (submissions.length < MIN_SUBMISSIONS) return { enough: false, have: submissions.length, need: MIN_SUBMISSIONS }

  // H: hồ sơ không bị chờ quá lâu, và mọi vai trò mà quy trình cần đều đã tham gia.
  const waits = submissions.flatMap((s) => stepWaits(s).map((w) => w.hours))
  const rolesNeeded = new Set(apps.flatMap((a) => a.spec.steps.map((s) => s.role)))
  const rolesActive = new Set(submissions.flatMap((s) => s.events.map((e) => s.version.spec.steps.find((x) => x.key === e.step_key)?.role).filter(Boolean)))
  const H = combine([
    { key: 'timely', weight: 50, value: ratio(waits.filter((h) => h <= WAIT_LIMIT_HOURS).length, waits.length) },
    { key: 'roles', weight: 50, value: ratio([...rolesNeeded].filter((r) => rolesActive.has(r)).length, rolesNeeded.size) },
  ])

  // P: quy trình đã được cải tiến có kiểm soát (nhiều phiên bản, đề xuất được xử lý), hồ sơ chạy bản mới nhất.
  const changes = apps.flatMap((a) => a.changes)
  const latest = new Map(apps.map((a) => [a.key, Math.max(0, ...a.versions.map((v) => v.version))]))
  const running = submissions.filter((s) => s.status === 'running')
  const P = combine([
    { key: 'versioned', weight: 40, value: ratio(apps.filter((a) => a.versions.length >= 2).length, apps.length) },
    { key: 'reviewed', weight: 40, value: ratio(changes.filter((c) => c.status !== 'open').length, changes.length) },
    { key: 'current', weight: 20, value: ratio(running.filter((s) => s.app_version === latest.get(s.app.key)).length, running.length) },
  ])

  // D: nhật ký đầy đủ (mọi bước áp dụng đều có dấu) và đủ mẫu để số liệu có nghĩa.
  const finished = submissions.filter((s) => s.status === 'approved')
  const complete = finished.filter((s) => s.version.spec.steps.filter((st) => applies(st, s.data)).every((st) => s.events.some((e) => e.step_key === st.key)))
  const perApp = new Map()
  for (const s of submissions) perApp.set(s.app.key, (perApp.get(s.app.key) ?? 0) + 1)
  const D = combine([
    { key: 'complete', weight: 60, value: ratio(complete.length, finished.length) },
    { key: 'sample', weight: 40, value: ratio(apps.filter((a) => (perApp.get(a.key) ?? 0) >= MIN_SAMPLE_PER_PROCESS).length, apps.length) },
  ])

  // I: trợ lý AI thật sự được dùng: có ý kiến ở bước, và có bước đã được nâng nấc tự chủ.
  const totalSteps = apps.reduce((n, a) => n + a.spec.steps.length, 0)
  const opined = new Set(submissions.flatMap((s) => (s.opinions ?? []).map((o) => `${s.app.key}/${o.step_key}`)))
  const I = combine([
    { key: 'opined', weight: 50, value: ratio(opined.size, totalSteps) },
    { key: 'promoted', weight: 50, value: ratio(autonomy.filter((a) => a.level > 1).length, totalSteps) },
  ])

  const spaces = { H, P, D, I }
  const scores = Object.values(spaces).map((x) => x.score).filter((x) => x !== null)
  return { enough: true, spaces, overall: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : null }
}
