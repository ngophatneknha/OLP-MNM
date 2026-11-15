<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Trang cá nhân và trung tâm thông báo [H]. Thông báo suy ra từ hồ sơ thật: việc đang chờ tôi,
và kết quả mới của hồ sơ tôi đã gửi.
-->
<script setup>
import { live } from '../live.js'
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { Bell } from 'lucide-vue-next'
import { auth, gql, ago, initials, waitsOnMe } from '../lib.js'
import { t } from '../i18n.js'

const list = ref(null)
let timer
async function load() {
  list.value = (await gql(`{ submission(order_by: {created_at: desc}, limit: 100) {
    id no status current_step waiting_role submitter_id submitter_name created_at finished_at app { name } version { spec }
  } }`)).submission
}
onMounted(() => { load().catch(() => {}); timer = live(load) })
onUnmounted(() => timer?.())

const mine = computed(() => (list.value ?? []).filter((s) => s.submitter_id === auth.userId))
const waiting = computed(() => (list.value ?? []).filter(waitsOnMe))
const notices = computed(() => [
  ...waiting.value.map((s) => ({ s, at: s.created_at, kind: 'waiting' })),
  ...mine.value.filter((s) => s.finished_at).map((s) => ({ s, at: s.finished_at, kind: s.status })),
].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 15))
const TONE = { waiting: 'pill-wait', approved: 'pill-done', rejected: 'pill-stop' }
</script>

<template>
  <h1 class="page-title">{{ t('me.title') }}</h1>
  <p class="page-lead">{{ t('me.lead') }}</p>
  <div class="panel mt-6 flex flex-wrap items-center gap-4 px-4 py-4">
    <span class="avatar h-12 w-12 text-base">{{ initials(auth.name) }}</span>
    <div class="min-w-0 flex-1">
      <div class="text-lg font-semibold">{{ auth.name }}</div>
      <div class="text-sm text-pencil">{{ t('me.role') }}: {{ t(`role.${auth.role}`) }}</div>
    </div>
    <dl class="flex gap-6 text-sm">
      <div><dt class="text-pencil">{{ t('me.sent') }}</dt><dd class="num text-lg font-semibold">{{ mine.length }}</dd></div>
      <div><dt class="text-pencil">{{ t('me.waiting') }}</dt><dd class="num text-lg font-semibold">{{ waiting.length }}</dd></div>
    </dl>
  </div>
  <h2 class="section-title mt-8 flex items-center gap-2"><Bell :size="18" aria-hidden="true" /> {{ t('me.notices') }}</h2>
  <p class="hint">{{ t('me.live') }}</p>
  <div class="panel mt-3">
    <p v-if="list && !notices.length" class="px-4 py-5 text-pencil">{{ t('me.none') }}</p>
    <RouterLink v-for="n in notices" :key="n.kind + n.s.id" :to="`/ho-so/${n.s.id}`" class="panel-row">
      <span class="pill" :class="TONE[n.kind]">{{ t(n.kind === 'waiting' ? 'status.running' : `status.${n.kind}`) }}</span>
      <span class="min-w-0 flex-1">{{ n.s.app.name }} #{{ n.s.no }} {{ t(`notice.${n.kind}`) }}</span>
      <span class="text-xs text-pencil">{{ ago(n.at) }}</span>
    </RouterLink>
  </div>
</template>
