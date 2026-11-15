// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Gợi ý cải tiến quy trình và nhắc việc quá hạn, tính từ dữ liệu thật của hồ sơ (không dùng AI).
// Hàm thuần, có kiểm thử: hints.test.js. Ngưỡng được công bố ở docs/HUONG_DAN.md.

import { WAIT_LIMIT_HOURS } from './maturity.js'
import { stepWaits } from './metrics.js'

export const SLOW_HOURS = WAIT_LIMIT_HOURS // chờ trung bình quá ngưỡng này thì đáng xem lại
export const MIN_SAMPLE = 3 // dưới ngưỡng này thì chưa đủ mẫu để kết luận
export const REJECT_RATE = 0.4
const HOUR = 3_600_000

/** Số giờ hồ sơ đang chờ ở bước hiện tại (từ dấu cuối cùng, hoặc từ lúc gửi). */
export function hoursWaiting(s, now = Date.now()) {
  const last = s.events.length ? Math.max(...s.events.map((e) => Date.parse(e.created_at))) : Date.parse(s.created_at)
  return (now - last) / HOUR
}
export const isOverdue = (s, now) => s.status === 'running' && hoursWaiting(s, now) > WAIT_LIMIT_HOURS

/**
 * Các bước đáng xem lại: chờ trung bình quá lâu, hoặc hay bị từ chối. Mỗi gợi ý nêu rõ con số làm căn cứ.
 * @returns [{ kind: 'slow'|'rejected', process, step, role, value, count, appKey }] đã sắp theo mức nghiêm trọng
 */
export function improvementHints(submissions) {
  const byStep = new Map()
  for (const s of submissions) {
    const waits = new Map(stepWaits(s).map((w) => [w.step_key, w.hours]))
    for (const e of s.events) {
      const step = s.version.spec.steps.find((x) => x.key === e.step_key)
      if (!step) continue
      const id = `${s.app.key}/${step.key}`
      const entry = byStep.get(id) ?? { appKey: s.app.key, process: s.app.name, step: step.name, role: step.role, hours: [], rejects: 0 }
      entry.hours.push(waits.get(e.step_key) ?? 0)
      if (e.action === 'reject') entry.rejects += 1
      byStep.set(id, entry)
    }
  }
  const out = []
  for (const e of byStep.values()) {
    if (e.hours.length < MIN_SAMPLE) continue
    const avg = e.hours.reduce((a, b) => a + b, 0) / e.hours.length
    if (avg > SLOW_HOURS) out.push({ kind: 'slow', appKey: e.appKey, process: e.process, step: e.step, role: e.role, value: avg, count: e.hours.length })
    const rate = e.rejects / e.hours.length
    if (rate >= REJECT_RATE) out.push({ kind: 'rejected', appKey: e.appKey, process: e.process, step: e.step, role: e.role, value: rate, count: e.hours.length })
  }
  return out.sort((a, b) => b.value / (b.kind === 'slow' ? SLOW_HOURS : REJECT_RATE) - a.value / (a.kind === 'slow' ? SLOW_HOURS : REJECT_RATE))
}

/** Vai trò mà quy trình cần nhưng chưa từng ký hồ sơ nào: dấu hiệu quy trình tồn tại trên giấy. */
export function missingRoles(submissions, apps) {
  const needed = new Set(apps.flatMap((a) => a.spec.steps.map((s) => s.role)))
  const active = new Set(submissions.flatMap((s) => s.events.map((e) => s.version.spec.steps.find((x) => x.key === e.step_key)?.role).filter(Boolean)))
  return [...needed].filter((r) => !active.has(r))
}
