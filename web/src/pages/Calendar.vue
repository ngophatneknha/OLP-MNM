<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Lịch [H]: lưới tháng, mỗi ô liệt kê hồ sơ gửi và hoàn tất trong ngày đó.
-->
<script setup>
import { computed, onMounted, ref } from 'vue'
import { ChevronLeft, ChevronRight } from 'lucide-vue-next'
import { gql } from '../lib.js'
import { t, i18n } from '../i18n.js'

const list = ref([])
const monthStart = () => new Date(new Date().getFullYear(), new Date().getMonth(), 1)
const cursor = ref(monthStart())
onMounted(async () => {
  list.value = (await gql('{ submission(order_by: {created_at: desc}, limit: 500) { id no status created_at finished_at app { name } } }')).submission
})

const dayKey = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`
const byDay = computed(() => {
  const map = new Map()
  const add = (iso, kind, s) => { const k = dayKey(new Date(iso)); map.set(k, [...(map.get(k) ?? []), { kind, s }]) }
  for (const s of list.value) { add(s.created_at, 'sent', s); if (s.finished_at) add(s.finished_at, 'finished', s) }
  return map
})
const locale = computed(() => (i18n.lang === 'en' ? 'en-GB' : 'vi-VN'))
// Tuần bắt đầu từ thứ Hai, theo thói quen văn phòng Việt Nam.
const cells = computed(() => {
  const first = cursor.value
  const lead = (first.getDay() + 6) % 7
  const total = Math.ceil((lead + new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate()) / 7) * 7
  return Array.from({ length: total }, (_, i) => {
    const date = new Date(first.getFullYear(), first.getMonth(), i - lead + 1)
    return { date, inMonth: date.getMonth() === first.getMonth(), items: byDay.value.get(dayKey(date)) ?? [] }
  })
})
const title = computed(() => cursor.value.toLocaleDateString(locale.value, { month: 'long', year: 'numeric' }))
const weekdays = computed(() => Array.from({ length: 7 }, (_, i) => new Date(2024, 0, 1 + i).toLocaleDateString(locale.value, { weekday: 'short' })))
const shift = (n) => { cursor.value = new Date(cursor.value.getFullYear(), cursor.value.getMonth() + n, 1) }
const isToday = (d) => dayKey(d) === dayKey(new Date())
</script>

<template>
  <h1 class="page-title">{{ t('cal.title') }}</h1>
  <p class="page-lead">{{ t('cal.lead') }}</p>
  <div class="mt-6 flex items-center gap-2">
    <button class="btn-icon" :aria-label="t('cal.prev')" @click="shift(-1)"><ChevronLeft :size="18" aria-hidden="true" /></button>
    <h2 class="min-w-40 text-center font-semibold capitalize">{{ title }}</h2>
    <button class="btn-icon" :aria-label="t('cal.next')" @click="shift(1)"><ChevronRight :size="18" aria-hidden="true" /></button>
    <button class="btn-quiet ml-2" @click="cursor = monthStart()">{{ t('cal.today') }}</button>
  </div>
  <div class="mt-3 overflow-x-auto">
    <div class="grid min-w-[42rem] grid-cols-7 gap-px overflow-hidden rounded-lg border border-line bg-line">
      <div v-for="w in weekdays" :key="w" class="bg-ground px-2 py-1.5 text-xs font-medium text-pencil">{{ w }}</div>
      <div v-for="c in cells" :key="c.date.toISOString()" class="min-h-24 p-1.5" :class="c.inMonth ? 'bg-surface' : 'bg-ground/60'">
        <div class="num text-xs" :class="isToday(c.date) ? 'inline-grid h-5 w-5 place-items-center rounded-full bg-pen font-semibold text-white' : 'text-pencil'">{{ c.date.getDate() }}</div>
        <RouterLink
          v-for="(it, i) in c.items.slice(0, 3)" :key="i" :to="`/ho-so/${it.s.id}`"
          class="mt-1 block truncate rounded px-1.5 py-0.5 text-xs"
          :class="it.kind === 'sent' ? 'bg-pen-wash text-pen' : it.s.status === 'rejected' ? 'bg-seal-wash text-seal' : 'bg-done-wash text-done'"
        >{{ it.s.app.name }} #{{ it.s.no }} · {{ t(`cal.${it.kind}`) }}</RouterLink>
        <div v-if="c.items.length > 3" class="mt-1 text-xs text-pencil">+{{ c.items.length - 3 }}</div>
      </div>
    </div>
  </div>
</template>
