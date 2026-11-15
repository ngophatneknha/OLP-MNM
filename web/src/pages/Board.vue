<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Bảng công việc [H]: hồ sơ xếp cột theo tình trạng (Kanban), dữ liệu lấy thẳng từ hồ sơ thật, không có thẻ nhập tay.
-->
<script setup>
import { live } from '../live.js'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { auth, gql, headline, whereIs, waitsOnMe } from '../lib.js'
import { t } from '../i18n.js'

const LIMIT = 15 // cột dài thì chỉ hiện việc mới nhất để bảng còn đọc được
const list = ref(null)
let timer
async function load() {
  list.value = (await gql(`{ submission(order_by: {created_at: desc}, limit: 200) {
    id no data status current_step waiting_role submitter_id submitter_name created_at finished_at
    app { key name category } version { spec } events { action note actor_name }
  } }`)).submission
}
onMounted(() => { load().catch(() => {}); timer = live(load) })
onUnmounted(() => timer?.())

const columns = computed(() => {
  const all = list.value ?? []
  return [
    { key: 'mine', title: t('board.mine'), tone: 'pill-wait', items: all.filter(waitsOnMe) },
    { key: 'others', title: t('board.others'), tone: 'pill-plain', items: all.filter((s) => s.status === 'running' && !waitsOnMe(s)) },
    { key: 'approved', title: t('status.approved'), tone: 'pill-done', items: all.filter((s) => s.status === 'approved') },
    { key: 'rejected', title: t('status.rejected'), tone: 'pill-stop', items: all.filter((s) => s.status === 'rejected') },
  ]
})
</script>

<template>
  <h1 class="page-title">{{ t('board.title') }}</h1>
  <p class="page-lead">{{ t('board.lead') }}</p>
  <p v-if="!list" class="mt-8 text-pencil">{{ t('board.loading') }}</p>
  <div v-else class="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
    <section v-for="col in columns" :key="col.key" :aria-label="col.title" class="min-w-0 rounded-lg border border-line bg-ground/60 p-3">
      <h2 class="mb-3 flex items-center justify-between text-sm font-semibold">
        {{ col.title }} <span class="pill num" :class="col.tone">{{ col.items.length }}</span>
      </h2>
      <p v-if="!col.items.length" class="px-1 py-3 text-sm text-pencil">{{ t('board.empty') }}</p>
      <ul class="space-y-2">
        <li v-for="s in col.items.slice(0, LIMIT)" :key="s.id">
          <RouterLink :to="`/ho-so/${s.id}`" class="block rounded-md border border-line bg-surface p-3 text-sm transition-colors hover:border-pen">
            <div class="font-medium">{{ s.app.name }} #{{ s.no }}</div>
            <div class="num mt-0.5 truncate text-pencil">{{ headline(s) }}</div>
            <div class="mt-1 text-xs text-pencil">{{ s.submitter_id === auth.userId || !s.submitter_name ? '' : s.submitter_name + ' · ' }}{{ whereIs(s) }}</div>
          </RouterLink>
        </li>
      </ul>
      <p v-if="col.items.length > LIMIT" class="mt-2 px-1 text-xs text-pencil">+{{ col.items.length - LIMIT }} {{ t('board.more') }}</p>
    </section>
  </div>
</template>
