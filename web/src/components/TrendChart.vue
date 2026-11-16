<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Đường xu hướng 4 tuần của hai không gian có lịch sử (H và D). Hai đường khác nhau cả về màu lẫn hình điểm
(tròn, vuông) và có nhãn ngay ở cuối đường, nên không cần đoán theo màu. Bảng số liệu nằm kèm cho trình đọc màn hình.
-->
<script setup>
import { computed } from 'vue'
import { t } from '../i18n.js'

const props = defineProps({ trend: { type: Array, required: true } }) // [{ at, H, D }] theo thứ tự cũ đến mới

const W = 520
const H = 190
const PAD = { l: 34, r: 56, t: 14, b: 30 }
const x = (i) => PAD.l + (props.trend.length < 2 ? 0 : (i / (props.trend.length - 1)) * (W - PAD.l - PAD.r))
const y = (v) => PAD.t + (1 - v / 100) * (H - PAD.t - PAD.b)
const SERIES = [
  { key: 'H', color: 'var(--color-pen)', square: false },
  { key: 'D', color: 'var(--color-done)', square: true },
]
const lines = computed(() => SERIES.map((s) => {
  const pts = props.trend.map((w, i) => (w[s.key] === null ? null : { x: x(i), y: y(w[s.key]), v: w[s.key] })).filter(Boolean)
  return { ...s, pts, path: pts.map((p, i) => `${i ? 'L' : 'M'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ') }
}))
const enough = computed(() => lines.value.some((l) => l.pts.length >= 2))
const label = (i) => (i === props.trend.length - 1 ? t('mat.now') : t('mat.ago', { n: props.trend.length - 1 - i }))
const aria = computed(() => t('mat.trendAria', { h: props.trend.at(-1)?.H ?? '–', d: props.trend.at(-1)?.D ?? '–' }))
</script>

<template>
  <p v-if="!enough" class="rounded bg-ground px-4 py-6 text-sm text-pencil">{{ t('mat.noHistory', { h: trend.at(-1)?.H ?? '–', d: trend.at(-1)?.D ?? '–' }) }}</p>
  <svg v-else :viewBox="`0 0 ${W} ${H}`" class="h-auto w-full" role="img" :aria-label="aria">
    <g stroke="var(--color-line)" stroke-width="1" font-size="11" fill="var(--color-pencil)">
      <g v-for="v in [0, 50, 100]" :key="v">
        <line :x1="PAD.l" :x2="W - PAD.r" :y1="y(v)" :y2="y(v)" :stroke-dasharray="v === 0 ? '' : '3 3'" />
        <text :x="PAD.l - 8" :y="y(v) + 4" text-anchor="end" stroke="none">{{ v }}</text>
      </g>
      <text v-for="(w, i) in trend" :key="w.at" :x="x(i)" :y="H - 8" text-anchor="middle" stroke="none">{{ label(i) }}</text>
    </g>
    <g v-for="s in lines" :key="s.key">
      <path :d="s.path" fill="none" :stroke="s.color" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" />
      <template v-for="p in s.pts" :key="p.x">
        <rect v-if="s.square" :x="p.x - 4.5" :y="p.y - 4.5" width="9" height="9" :fill="s.color" />
        <circle v-else :cx="p.x" :cy="p.y" r="5" :fill="s.color" />
      </template>
      <text v-if="s.pts.length" :x="s.pts.at(-1).x + 12" :y="s.pts.at(-1).y + 4" font-size="13" font-weight="700" :fill="s.color">{{ s.key }} {{ s.pts.at(-1).v }}</text>
    </g>
  </svg>
  <table class="sr-only">
    <thead><tr><th>{{ t('mat.week') }}</th><th>H</th><th>D</th></tr></thead>
    <tbody><tr v-for="(w, i) in trend" :key="w.at"><th scope="row">{{ label(i) }}</th><td>{{ w.H ?? '–' }}</td><td>{{ w.D ?? '–' }}</td></tr></tbody>
  </table>
</template>
