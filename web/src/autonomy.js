// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Bằng chứng để nâng nấc tự chủ của trợ lý AI. Cùng luật với trigger autonomy_guard ở cơ sở dữ liệu
// (từ nấc 2 lên cần ít nhất 10 quyết định thật và 90% khớp); ở đây chỉ để giao diện báo trước, CSDL vẫn là nơi chặn thật.
// Hàm thuần, có kiểm thử: autonomy.test.js.

export const MIN_DECISIONS = 10
export const MIN_RATE = 0.9

/** Bằng chứng ở đúng nấc hiện tại: các quyết định thật của người, không tính dữ liệu mẫu hay lần AI tự duyệt. */
export function evidence(opinions, appKey, stepKey, level) {
  const list = opinions.filter((o) => o.submission.app_key === appKey && o.step_key === stepKey && o.level === level && o.matched !== null && !o.sample)
  return { total: list.length, hits: list.filter((o) => o.matched).length }
}

export const canRaise = (ev, level) => level === 1 || (level < 4 && ev.total >= MIN_DECISIONS && ev.hits >= ev.total * MIN_RATE)

/** Các bước duyệt đã đủ bằng chứng để giám đốc nâng nấc (không tính nấc 1, vì lên nấc 2 là quyết định ban đầu, chưa có bằng chứng). */
export function readyToPromote(apps, levels, opinions) {
  return apps.flatMap((app) => app.spec.steps.filter((s) => s.type !== 'task').flatMap((step) => {
    const level = levels.find((r) => r.app_key === app.key && r.step_key === step.key)?.level ?? 1
    return level >= 2 && canRaise(evidence(opinions, app.key, step.key, level), level) ? [{ app, step, level }] : []
  }))
}

/** Độ khớp chung giữa trợ lý và người, trên các ý kiến đã có quyết định thật. */
export function agreement(opinions) {
  const list = opinions.filter((o) => o.matched !== null && o.matched !== undefined && !o.sample)
  return { total: list.length, hits: list.filter((o) => o.matched).length }
}
