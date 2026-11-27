<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Bản đồ cảm biến (không gian [D]): vị trí và trạng thái cảm biến, đọc qua đầu ra NGSI-LD của cổng API.
Không dùng nền bản đồ từ bên ngoài (chính sách CSP chỉ cho ảnh cùng nguồn): nền là ranh giới tỉnh, thành tự chứa
(public/basemap-vn.json, Natural Earth, có Hoàng Sa và Trường Sa), kèm lưới theo km, thanh tỉ lệ và hướng bắc; vị trí chiếu giữ đúng tỉ lệ. Cảnh báo khác trạng thái thường cả về màu lẫn hình (tam giác, không chỉ màu đỏ).
-->
<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { TriangleAlert, CircleCheck } from 'lucide-vue-next'
import { getJson } from '../lib.js'
import { live } from '../live.js'
import { toPoints, projectEqual, shapePaths, regionAt } from '../geo.js'
import { t } from '../i18n.js'

const W = 720
const H = 460
const entities = ref(null)
const hovered = ref('')
let timer
async function load() {
  try { entities.value = await getJson('/ngsi-ld/v1/entities?type=Device') } catch { entities.value = [] }
}
// Nền bản đồ cùng nguồn với trang; tải hỏng thì bản đồ vẫn vẽ điểm trên lưới như trước.
const basemap = ref(null)
async function loadBase() {
  try { const r = await fetch('/basemap-vn.json'); basemap.value = r.ok ? await r.json() : null } catch { basemap.value = null }
}
onMounted(() => { load(); loadBase(); timer = live(load) })
onUnmounted(() => timer?.())

const all = computed(() => toPoints(entities.value ?? []))
const view = computed(() => projectEqual(all.value, W, H))
const points = computed(() => view.value.points)
const shapes = computed(() => shapePaths(basemap.value, view.value.toXY, W, H))
const region = computed(() => {
  if (!points.value.length) return ''
  const mean = (k) => points.value.reduce((sum, p) => sum + p[k], 0) / points.value.length
  return regionAt(basemap.value, mean('lon'), mean('lat'))
})
const missing = computed(() => (entities.value?.length ?? 0) - points.value.length)
const alarms = computed(() => points.value.filter((p) => p.alarm).length)

// Bước lưới "đẹp" (1, 2, 5 nhân lũy thừa của 10 km) sao cho một ô rộng khoảng 90 px.
const stepKm = computed(() => {
  const raw = view.value.kmPerPx * 90
  if (!raw) return 1
  const mag = 10 ** Math.floor(Math.log10(raw))
  return [1, 2, 5, 10].map((m) => m * mag).find((v) => v >= raw) ?? 10 * mag
})
const stepPx = computed(() => (view.value.kmPerPx ? stepKm.value / view.value.kmPerPx : 90))
const vLines = computed(() => Array.from({ length: Math.floor(W / stepPx.value) + 1 }, (_, i) => (W / 2) % stepPx.value + i * stepPx.value))
const hLines = computed(() => Array.from({ length: Math.floor(H / stepPx.value) + 1 }, (_, i) => (H / 2) % stepPx.value + i * stepPx.value))
const kmLabel = computed(() => (stepKm.value < 1 ? `${Math.round(stepKm.value * 1000)} m` : `${stepKm.value} km`))
const tri = (p) => `${p.x},${p.y - 12} ${p.x + 11},${p.y + 8} ${p.x - 11},${p.y + 8}`
const state = (p) => (p.alarm ? 'alarm' : 'ok')
</script>

<template>
  <h1 class="page-title">{{ t('map.title') }}</h1>
  <p class="page-lead">{{ t('map.hint') }}</p>
  <p v-if="entities === null" class="mt-6 text-pencil">{{ t('common.loading') }}</p>
  <p v-else-if="!points.length" class="panel mt-6 px-4 py-5 text-pencil">{{ t('map.empty') }}</p>
  <template v-else>
    <dl class="mt-6 grid grid-cols-3 gap-3 sm:max-w-md">
      <div class="panel px-4 py-3"><dt class="text-xs text-pencil">{{ t('map.sensors') }}</dt><dd class="num text-2xl font-semibold">{{ points.length }}</dd></div>
      <div class="panel px-4 py-3"><dt class="text-xs text-pencil">{{ t('map.ok') }}</dt><dd class="num text-2xl font-semibold text-done">{{ points.length - alarms }}</dd></div>
      <div class="panel px-4 py-3"><dt class="text-xs text-pencil">{{ t('map.alarm') }}</dt><dd class="num text-2xl font-semibold" :class="alarms ? 'text-seal' : ''">{{ alarms }}</dd></div>
    </dl>

    <div class="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_19rem]">
      <svg :viewBox="`0 0 ${W} ${H}`" class="h-auto w-full rounded-xl border border-line bg-pen-wash/60" role="img" :aria-label="t('map.aria', { n: points.length, a: alarms })">
        <g fill="var(--color-surface)" stroke="var(--color-pencil)" stroke-width="1" stroke-opacity="0.55" stroke-linejoin="round">
          <path v-for="s in shapes" :key="s.code" :d="s.d"><title>{{ s.name }}</title></path>
        </g>
        <g stroke="var(--color-line)" stroke-width="1" stroke-opacity="0.6">
          <line v-for="x in vLines" :key="'v' + x" :x1="x" :x2="x" y1="0" :y2="H" />
          <line v-for="y in hLines" :key="'h' + y" x1="0" :x2="W" :y1="y" :y2="y" />
        </g>
        <g v-for="p in points" :key="p.id" class="cursor-pointer" @mouseenter="hovered = p.id" @mouseleave="hovered = ''">
          <circle :cx="p.x" :cy="p.y" :r="hovered === p.id ? 30 : 22" :fill="p.alarm ? 'var(--color-seal)' : 'var(--color-pen)'" fill-opacity="0.14" :class="p.alarm ? 'halo' : ''" />
          <polygon v-if="p.alarm" :points="tri(p)" fill="var(--color-seal)" stroke="var(--color-surface)" stroke-width="2.5" stroke-linejoin="round" />
          <circle v-else :cx="p.x" :cy="p.y" r="8" fill="var(--color-pen)" stroke="var(--color-surface)" stroke-width="2.5" />
          <text :x="p.x + 18" :y="p.y + 5" font-size="14" font-weight="600" fill="var(--color-ink)" stroke="var(--color-surface)" stroke-width="4" paint-order="stroke">{{ p.name }}</text>
        </g>
        <g transform="translate(24 428)" font-size="12" fill="var(--color-ink)">
          <path :d="`M0 0 V-6 H${stepPx} V0`" fill="none" stroke="var(--color-ink)" stroke-width="2" />
          <text :x="stepPx + 8" y="0" class="num">{{ kmLabel }}</text>
        </g>
        <text v-if="region" :x="W - 16" :y="H - 16" text-anchor="end" font-size="13" fill="var(--color-pencil)" stroke="var(--color-surface)" stroke-width="4" paint-order="stroke">{{ t('map.region', { name: region }) }}</text>
        <g transform="translate(682 40)" fill="none" stroke="var(--color-ink)" stroke-width="2" stroke-linejoin="round">
          <path d="M0 -18 L8 10 L0 4 L-8 10 Z" fill="var(--color-ink)" />
          <text x="0" y="28" text-anchor="middle" stroke="none" fill="var(--color-ink)" font-size="13" font-weight="700">{{ t('map.north') }}</text>
        </g>
      </svg>

      <ul class="panel self-start">
        <li v-for="p in points" :key="p.id">
          <button type="button" class="panel-row w-full text-left transition-colors" :class="hovered === p.id ? 'bg-pen-wash/70' : ''" @mouseenter="hovered = p.id" @mouseleave="hovered = ''" @focus="hovered = p.id" @blur="hovered = ''">
            <span class="grid h-9 w-9 shrink-0 place-items-center rounded-full" :class="p.alarm ? 'bg-seal-wash text-seal' : 'bg-done-wash text-done'">
              <component :is="p.alarm ? TriangleAlert : CircleCheck" :size="18" aria-hidden="true" />
            </span>
            <span class="min-w-0 flex-1">
              <span class="block truncate font-medium">{{ p.name }}</span>
              <span class="num block text-xs text-pencil">{{ p.lat.toFixed(4) }}, {{ p.lon.toFixed(4) }}</span>
            </span>
            <span class="text-right">
              <span class="num block text-lg font-semibold" :class="p.alarm ? 'text-seal' : ''">{{ p.value ?? '—' }} <span class="text-xs font-normal text-pencil">{{ p.unit }}</span></span>
              <span class="pill" :class="p.alarm ? 'pill-stop' : 'pill-done'">{{ state(p) === 'alarm' ? t('map.alarm') : t('map.ok') }}</span>
            </span>
          </button>
        </li>
      </ul>
    </div>
    <p v-if="missing > 0" class="hint">{{ t('map.missing', { n: missing }) }}</p>
    <p v-if="shapes.length" class="hint">{{ t('map.source') }}</p>
  </template>
</template>

<style scoped>
.halo { animation: halo 2.4s ease-out infinite; transform-box: fill-box; transform-origin: center; }
@keyframes halo { 0% { transform: scale(0.8); opacity: 0.35; } 100% { transform: scale(1.5); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .halo { animation: none; } }
</style>
