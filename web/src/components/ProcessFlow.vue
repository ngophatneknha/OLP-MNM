<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Sơ đồ quy trình: bắt đầu, từng bước, kết thúc, nối bằng mũi tên. Bước có điều kiện có đường vòng bỏ qua.
Khi có hồ sơ, từng bước mang trạng thái (đã ký, đang chờ, bỏ qua, từ chối, chưa tới) và bước đang chờ
nhấp nháy nhẹ; hồ sơ nhảy bước thì sơ đồ đổi theo ở lần cập nhật kế tiếp (vài giây). Không truyền
`submission` thì đây là bản xem trước của quy trình. Trạng thái luôn có chữ hoặc ký hiệu đi kèm, không chỉ dựa vào màu.
-->
<script setup>
import { computed } from 'vue'
import { flowLayout, stepStates } from '../flow.js'
import { t } from '../i18n.js'
import { ROLE_LABEL } from '../lib.js'

const props = defineProps({
  spec: { type: Object, required: true },
  submission: { type: Object, default: null },
})

const states = computed(() => stepStates(props.spec, props.submission))
const layout = computed(() => flowLayout(states.value))
const GLYPH = { signed: '✓', refused: '✕', waiting: '…', skipped: '–' }
const clip = (text, n) => (text.length > n ? `${text.slice(0, n - 1)}…` : text)
</script>

<template>
  <div class="overflow-x-auto rounded-md border border-line bg-surface" role="group" :aria-label="t('flow.label')">
    <svg :viewBox="`0 0 ${layout.width} ${layout.height}`" :width="layout.width" :height="layout.height" class="mx-auto block max-w-none" role="img" :aria-label="t('flow.label')">
      <defs>
        <marker id="flow-arrow" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M0 0 L8 4 L0 8 z" class="fill-pencil" />
        </marker>
      </defs>

      <path v-for="b in layout.bypasses" :key="'by-' + b.key" :d="`M ${b.from} ${b.y} C ${b.from} ${b.top}, ${b.to} ${b.top}, ${b.to} ${b.y}`" fill="none" class="stroke-pencil" stroke-width="1.2" stroke-dasharray="4 3" marker-end="url(#flow-arrow)" />
      <line v-for="(l, i) in layout.links" :key="'ln-' + i" :x1="l.x1" :y1="l.y" :x2="l.x2" :y2="l.y" class="stroke-pencil" stroke-width="1.5" marker-end="url(#flow-arrow)" />

      <circle :cx="layout.start.cx" :cy="layout.start.cy" r="10" class="fill-pen" />
      <g>
        <circle :cx="layout.end.cx" :cy="layout.end.cy" r="10" class="fill-surface stroke-pen" stroke-width="2" />
        <circle :cx="layout.end.cx" :cy="layout.end.cy" r="5" class="fill-pen" />
      </g>

      <g v-for="n in layout.nodes" :key="n.step.key">
        <title>{{ n.step.name }} ({{ ROLE_LABEL[n.step.role] ?? n.step.role }}): {{ t('flow.' + n.step.state) }}</title>
        <rect
          :x="n.x" :y="n.y" :width="n.w" :height="n.h" rx="8" stroke-width="2"
          :class="[
            n.step.state === 'waiting' ? 'fill-pen-wash stroke-pen motion-safe:animate-pulse'
              : n.step.state === 'signed' ? 'fill-done-wash stroke-done'
              : n.step.state === 'refused' ? 'fill-seal-wash stroke-seal'
              : 'fill-surface stroke-line',
          ]"
          :stroke-dasharray="n.step.state === 'skipped' ? '5 4' : null"
        />
        <text :x="n.x + 10" :y="n.y + 22" class="fill-ink text-[13.5px] font-semibold" :class="{ 'fill-pencil': n.step.state === 'skipped' }">{{ clip(n.step.name, 26) }}</text>
        <text :x="n.x + 10" :y="n.y + 42" class="fill-pencil text-[11.5px]">{{ clip(ROLE_LABEL[n.step.role] ?? n.step.role, 26) }}</text>
        <text v-if="GLYPH[n.step.state]" :x="n.x + n.w - 12" :y="n.y + 22" text-anchor="end" class="text-[14px] font-bold" :class="n.step.state === 'signed' ? 'fill-done' : n.step.state === 'refused' ? 'fill-seal' : 'fill-pen'">{{ GLYPH[n.step.state] }}</text>
      </g>
    </svg>
  </div>
  <ul v-if="submission" class="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-pencil" :aria-label="t('flow.legend')">
    <li>✓ {{ t('flow.signed') }}</li><li>… {{ t('flow.waiting') }}</li><li>– {{ t('flow.skipped') }}</li><li>✕ {{ t('flow.refused') }}</li>
  </ul>
</template>
