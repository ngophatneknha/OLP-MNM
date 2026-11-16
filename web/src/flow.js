// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0
//
// Trạng thái từng bước của quy trình cho một hồ sơ, dùng chung cho hàng ô ký và sơ đồ quy trình.
// Hàm thuần, có kiểm thử: flow.test.js.

/** Cùng phép so sánh mà bộ biên dịch đưa vào BPMN, để hiển thị khớp với đường đi thật. */
export function applies(step, data) {
  if (!step.when) return true
  const a = data[step.when.field], b = step.when.value
  return { '>': a > b, '>=': a >= b, '<': a < b, '<=': a <= b, '==': a === b, '!=': a !== b }[step.when.op]
}

/**
 * Mỗi bước kèm trạng thái: preview (chưa có hồ sơ), skipped, refused, signed, waiting, upcoming.
 * @param submission hồ sơ có data, events, current_step; null thì chỉ xem trước quy trình
 */
export function stepStates(spec, submission) {
  return (spec.steps ?? []).map((step) => {
    const event = submission?.events?.findLast((e) => e.step_key === step.key)
    let state = 'preview'
    if (submission) {
      state = !applies(step, submission.data) ? 'skipped'
        : event?.action === 'reject' ? 'refused'
        : event ? 'signed'
        : step.key === submission.current_step ? 'waiting'
        : 'upcoming'
    }
    return { ...step, state, event }
  })
}

/** Toạ độ sơ đồ nằm ngang: nút bắt đầu, từng bước, nút kết thúc; bước có điều kiện có đường vòng bỏ qua. */
export function flowLayout(steps, { nodeW = 210, nodeH = 56, gap = 44, pad = 14 } = {}) {
  const top = 30 // chừa chỗ cho đường vòng phía trên
  const mid = top + nodeH / 2
  let x = pad + 10 // nút bắt đầu rộng 20
  const start = { cx: x, cy: mid }
  x += 10 + gap
  const nodes = steps.map((step) => {
    const node = { step, x, y: top, w: nodeW, h: nodeH }
    x += nodeW + gap
    return node
  })
  const end = { cx: x + 10, cy: mid }
  const width = end.cx + 10 + pad
  const height = top + nodeH + pad
  const links = []
  let from = start.cx + 10
  for (const node of nodes) {
    links.push({ x1: from, x2: node.x, y: mid })
    from = node.x + node.w
  }
  links.push({ x1: from, x2: end.cx - 10, y: mid })
  const bypasses = nodes.filter((n) => n.step.when).map((n) => ({ key: n.step.key, from: n.x - gap / 2, to: n.x + n.w + gap / 2, y: mid, top: 8 }))
  return { start, nodes, end, links, bypasses, width, height }
}
