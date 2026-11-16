<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Biểu đồ mạng nhện bốn trục H-P-D-I: nhìn một lần là thấy không gian nào mạnh, không gian nào còn yếu.
Chỉ dùng SVG, không thư viện biểu đồ. Giá trị null vẽ như 0 và ghi dấu gạch ở nhãn.
-->
<script setup>
import { computed } from 'vue'
import { t } from '../i18n.js'

const props = defineProps({ scores: { type: Object, required: true } }) // { H, P, D, I }: số 0..100 hoặc null

const R = 96
const AXES = [
  { key: 'H', dx: 0, dy: -1 },
  { key: 'P', dx: 1, dy: 0 },
  { key: 'D', dx: 0, dy: 1 },
  { key: 'I', dx: -1, dy: 0 },
]
const at = (a, k) => `${(R * k * a.dx).toFixed(1)},${(R * k * a.dy).toFixed(1)}`
const rings = [0.25, 0.5, 0.75, 1]
const shape = computed(() => AXES.map((a) => at(a, (props.scores[a.key] ?? 0) / 100)).join(' '))
const dots = computed(() => AXES.map((a) => { const k = (props.scores[a.key] ?? 0) / 100; return { key: a.key, x: R * k * a.dx, y: R * k * a.dy } }))
const labelPos = { H: { x: 0, y: -R - 30, anchor: 'middle' }, P: { x: R + 12, y: 4, anchor: 'start' }, D: { x: 0, y: R + 26, anchor: 'middle' }, I: { x: -R - 12, y: 4, anchor: 'end' } }
const aria = computed(() => t('mat.radarAria', { h: props.scores.H ?? '–', p: props.scores.P ?? '–', d: props.scores.D ?? '–', i: props.scores.I ?? '–' }))
</script>

<template>
  <svg viewBox="-190 -150 380 310" class="mx-auto h-auto w-full max-w-sm" role="img" :aria-label="aria">
    <g fill="none" stroke="var(--color-line)" stroke-width="1">
      <polygon v-for="k in rings" :key="k" :points="AXES.map((a) => at(a, k)).join(' ')" :stroke-dasharray="k === 1 ? '' : '3 3'" />
      <line v-for="a in AXES" :key="a.key" x1="0" y1="0" :x2="R * a.dx" :y2="R * a.dy" />
    </g>
    <polygon :points="shape" fill="var(--color-pen)" fill-opacity="0.16" stroke="var(--color-pen)" stroke-width="2.5" stroke-linejoin="round" />
    <circle v-for="d in dots" :key="d.key" :cx="d.x" :cy="d.y" r="4.5" fill="var(--color-surface)" stroke="var(--color-pen)" stroke-width="2.5" />
    <g font-size="13" fill="var(--color-ink)">
      <text v-for="a in AXES" :key="a.key" :x="labelPos[a.key].x" :y="labelPos[a.key].y" :text-anchor="labelPos[a.key].anchor" font-weight="600">
        {{ a.key }} · {{ t('space.' + a.key) }}
        <tspan :x="labelPos[a.key].x" dy="15" font-size="15" class="num" fill="var(--color-pen)">{{ scores[a.key] ?? '–' }}</tspan>
      </text>
    </g>
  </svg>
</template>
