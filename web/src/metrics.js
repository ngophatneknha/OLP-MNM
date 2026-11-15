// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Số liệu điều hành tính từ chính dữ liệu hồ sơ và nhật ký (không có số liệu nhập tay).
// Hàm thuần, có kiểm thử: metrics.test.js.

import { locale, t } from './i18n.js'

const HOUR = 3600000

/** Thời gian chờ ở từng bước = khoảng cách từ lúc hồ sơ vào bước (gửi, hoặc hành động trước đó) tới lúc có người xử lý. */
export function stepWaits(submission) {
  let previous = Date.parse(submission.created_at)
  return [...submission.events]
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
    .map((event) => {
      const at = Date.parse(event.created_at)
      const wait = { step_key: event.step_key, hours: (at - previous) / HOUR }
      previous = at
      return wait
    })
}

const mean = (list) => list.length ? list.reduce((a, b) => a + b, 0) / list.length : 0

/**
 * @param submissions hồ sơ kèm app { name }, version { spec }, events
 * @param now mốc thời gian hiện tại (để kiểm thử được)
 */
export function computeMetrics(submissions, now = Date.now()) {
  const status = { running: 0, approved: 0, rejected: 0 }
  const finishedHours = []
  const byStep = new Map() // "tên quy trình / tên bước" -> { process, step, role, hours: [] }
  const byApp = new Map()
  const waiting = []

  for (const s of submissions) {
    status[s.status]++
    const app = byApp.get(s.app.name) ?? { name: s.app.name, total: 0, approved: 0, rejected: 0, running: 0 }
    app.total++
    app[s.status]++
    byApp.set(s.app.name, app)

    if (s.finished_at) finishedHours.push((Date.parse(s.finished_at) - Date.parse(s.created_at)) / HOUR)

    for (const wait of stepWaits(s)) {
      const step = s.version.spec.steps.find((x) => x.key === wait.step_key)
      if (!step) continue
      const id = `${s.app.name}/${step.key}`
      const entry = byStep.get(id) ?? { process: s.app.name, step: step.name, role: step.role, hours: [] }
      entry.hours.push(wait.hours)
      byStep.set(id, entry)
    }

    if (s.status === 'running') {
      const last = s.events.length ? Math.max(...s.events.map((e) => Date.parse(e.created_at))) : Date.parse(s.created_at)
      const step = s.version.spec.steps.find((x) => x.key === s.current_step)
      waiting.push({ id: s.id, no: s.no, process: s.app.name, step: step?.name ?? '', role: s.waiting_role, hours: (now - last) / HOUR })
    }
  }

  const steps = [...byStep.values()]
    .map((e) => ({ process: e.process, step: e.step, role: e.role, count: e.hours.length, avgHours: mean(e.hours) }))
    .sort((a, b) => b.avgHours - a.avgHours)

  return {
    total: submissions.length,
    status,
    avgDoneHours: mean(finishedHours),
    finishedCount: finishedHours.length,
    approvedRate: status.approved + status.rejected ? status.approved / (status.approved + status.rejected) : null,
    steps,
    bottleneck: steps[0] ?? null,
    apps: [...byApp.values()].sort((a, b) => b.total - a.total),
    longestWaiting: waiting.sort((a, b) => b.hours - a.hours).slice(0, 5),
  }
}

/** "2 giờ", "1,5 ngày", "vài giây" */
export function formatHours(hours) {
  const num = (n) => n.toFixed(1).replace(/\.0$/, '').replace('.', locale() === 'vi-VN' ? ',' : '.')
  if (hours < 1 / 60) return t('unit.seconds')
  if (hours < 1) return t('unit.minutes', { n: Math.round(hours * 60) })
  if (hours < 24) return t('unit.hoursShort', { n: num(hours) })
  return t('unit.daysShort', { n: num(hours / 24) })
}
