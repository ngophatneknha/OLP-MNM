<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Bản đồ cảm biến (không gian [D]): vị trí và trạng thái cảm biến, đọc qua đầu ra NGSI-LD của cổng API.
-->
<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { getJson } from '../lib.js'
import { live } from '../live.js'
import { toPoints, project } from '../geo.js'
import { t } from '../i18n.js'

const W = 640
const H = 420
const entities = ref(null)
let timer
async function load() {
  try { entities.value = await getJson('/ngsi-ld/v1/entities?type=Device') } catch { entities.value = [] }
}
onMounted(() => { load(); timer = live(load) })
onUnmounted(() => timer?.())
const points = computed(() => project(toPoints(entities.value ?? []), W, H))
const missing = computed(() => (entities.value?.length ?? 0) - points.value.length)
</script>

<template>
  <h1 class="font-serif text-2xl font-bold">{{ t('map.title') }}</h1>
  <p class="hint">{{ t('map.hint') }}</p>
  <p v-if="entities === null" class="mt-6 text-pencil">{{ t('common.loading') }}</p>
  <p v-else-if="!points.length" class="mt-6 text-pencil">{{ t('map.empty') }}</p>
  <template v-else>
    <svg :viewBox="`0 0 ${W} ${H}`" class="mt-4 w-full max-w-3xl rounded-lg border border-line bg-surface" role="img" :aria-label="t('map.title')">
      <g v-for="p in points" :key="p.id">
        <circle :cx="p.x" :cy="p.y" r="9" :class="p.alarm ? 'fill-red-600' : 'fill-pen'" />
        <text :x="p.x + 14" :y="p.y + 4" class="fill-current text-xs">{{ p.name }}</text>
      </g>
    </svg>
    <ul class="panel mt-4 max-w-3xl">
      <li v-for="p in points" :key="p.id" class="panel-row items-baseline">
        <span class="min-w-0 flex-1">{{ p.name }} <span class="num text-sm text-pencil">{{ p.lat.toFixed(4) }}, {{ p.lon.toFixed(4) }}</span></span>
        <span :class="p.alarm ? 'text-red-700' : 'text-pen'">{{ p.value ?? '—' }} {{ p.unit }} · {{ p.alarm ? t('map.alarm') : t('map.ok') }}</span>
      </li>
    </ul>
    <p v-if="missing > 0" class="hint">{{ t('map.missing', { n: missing }) }}</p>
  </template>
</template>
