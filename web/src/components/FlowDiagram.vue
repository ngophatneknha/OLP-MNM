<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Sơ đồ quy trình vẽ trực tiếp từ spec. Khi truyền `submission`, bước đang chờ sáng lên,
bước đã qua chuyển xanh, bước bị bỏ qua (điều kiện sai) mờ đi.
-->
<script setup>
import { computed } from 'vue'
import { ROLE_LABEL, conditionText } from '../lib.js'

const props = defineProps({
  spec: { type: Object, required: true },
  submission: { type: Object, default: null },
})

// Cùng phép so sánh mà bộ biên dịch đưa vào BPMN, để sơ đồ khớp với đường đi thật.
function applies(step, data) {
  if (!step.when) return true
  const a = data[step.when.field], b = step.when.value
  return { '>': a > b, '>=': a >= b, '<': a < b, '<=': a <= b, '==': a === b, '!=': a !== b }[step.when.op]
}

const nodes = computed(() => {
  const sub = props.submission
  const steps = props.spec.steps ?? []
  const currentIndex = sub ? steps.findIndex((s) => s.key === sub.current_step) : -1
  const rejectedAt = sub?.events?.find((e) => e.action === 'reject')?.step_key
  return steps.map((step, i) => {
    let state = 'idle'
    if (sub) {
      if (!applies(step, sub.data)) state = 'skipped'
      else if (step.key === rejectedAt) state = 'rejected'
      else if (step.key === sub.current_step) state = 'current'
      else if (sub.status === 'approved' || (currentIndex >= 0 && i < currentIndex) || sub.events?.some((e) => e.step_key === step.key)) state = 'done'
    }
    return { ...step, state, condition: conditionText(props.spec, step) }
  })
})

const STYLE = {
  idle: 'border-slate-300 bg-white',
  done: 'border-emerald-300 bg-emerald-50',
  current: 'border-indigo-500 bg-indigo-50 ring-4 ring-indigo-100',
  skipped: 'border-dashed border-slate-300 bg-slate-50 opacity-50',
  rejected: 'border-rose-400 bg-rose-50',
}
const MARK = { done: '✓', current: '●', rejected: '✕', skipped: '↷' }
</script>

<template>
  <ol class="flex flex-wrap items-stretch gap-y-3 text-sm">
    <li class="flex items-center">
      <div class="rounded-full border px-3 py-1.5" :class="submission ? 'border-emerald-300 bg-emerald-50' : 'border-slate-300 bg-white'">Gửi hồ sơ</div>
      <span class="px-2 text-slate-400" aria-hidden="true">→</span>
    </li>
    <li v-for="node in nodes" :key="node.key" class="flex items-center">
      <div class="rounded-lg border px-3 py-2 transition" :class="STYLE[node.state]">
        <div class="flex items-center gap-2 font-medium">
          <span v-if="MARK[node.state]" :class="{ 'animate-pulse text-indigo-600': node.state === 'current', 'text-emerald-600': node.state === 'done', 'text-rose-600': node.state === 'rejected' }">{{ MARK[node.state] }}</span>
          {{ node.name }}
        </div>
        <div class="mt-0.5 text-xs text-slate-500">
          {{ ROLE_LABEL[node.role] ?? node.role }} · {{ node.type === 'task' ? 'thực hiện' : 'duyệt' }}
        </div>
        <div v-if="node.condition" class="mt-1 text-xs text-amber-700">{{ node.condition }}</div>
      </div>
      <span class="px-2 text-slate-400" aria-hidden="true">→</span>
    </li>
    <li class="flex items-center">
      <div
        class="rounded-full border px-3 py-1.5"
        :class="submission?.status === 'approved' ? 'border-emerald-300 bg-emerald-50' : submission?.status === 'rejected' ? 'border-rose-400 bg-rose-50' : 'border-slate-300 bg-white'"
      >
        {{ submission?.status === 'rejected' ? 'Bị từ chối' : 'Hoàn tất' }}
      </div>
    </li>
  </ol>
</template>
