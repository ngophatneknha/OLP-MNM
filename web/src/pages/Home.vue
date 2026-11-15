<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Bàn làm việc: việc đang chờ tôi đứng đầu, sau đó là hồ sơ tôi đã gửi và lối tắt để gửi hồ sơ mới.
-->
<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ChevronRight, CircleCheck } from 'lucide-vue-next'
import { auth, gql, ago, givenName, initials, headline, whereIs, waitsOnMe, stepOf, routeText, suggestion, SUBMISSION_FIELDS } from '../lib.js'
import DecisionBar from '../components/DecisionBar.vue'
import CategoryIcon from '../components/CategoryIcon.vue'
import { t } from '../i18n.js'
import { readyToPromote } from '../autonomy.js'

const submissions = ref(null)
const apps = ref([])
const failed = ref('')
let timer

async function load() {
  try {
    const data = await gql(`{
      submission(order_by: {created_at: desc}, limit: 60) { ${SUBMISSION_FIELDS} }
      app(where: {status: {_eq: "published"}}, order_by: {name: asc}) { key name description category spec }
    }`)
    submissions.value = data.submission
    apps.value = data.app
    failed.value = ''
  } catch (err) {
    failed.value = err.message
  }
}
// shortcut: hỏi lại máy chủ mỗi 3 giây thay cho GraphQL subscription, vì trình duyệt không gửi được
// header Authorization khi mở WebSocket qua gateway; chuyển sang subscription khi gateway nhận token qua giao thức con.
const ready = ref([])
async function loadReady() {
  if (auth.role !== 'director') return
  try {
    const d = await gql(`{ app(where: {status: {_eq: "published"}}) { key spec } step_autonomy { app_key step_key level }
      ai_opinion(order_by: {id: desc}, limit: 400) { step_key level matched sample submission { app_key } } }`)
    ready.value = readyToPromote(d.app, d.step_autonomy, d.ai_opinion)
  } catch { ready.value = [] } // banner phụ: lỗi thì thôi, không ảnh hưởng việc chính
}
onMounted(() => { load(); loadReady(); timer = setInterval(load, 3000) })
onUnmounted(() => clearInterval(timer))

const waiting = computed(() => (submissions.value ?? []).filter(waitsOnMe))
const mine = computed(() => (submissions.value ?? []).filter((s) => s.submitter_id === auth.userId))

const hour = new Date().getHours()
const greeting = () => t(`home.greet.${hour < 11 ? 'morning' : hour < 14 ? 'noon' : hour < 18 ? 'afternoon' : 'evening'}`)
const summary = computed(() => {
  if (submissions.value === null) return ''
  const running = mine.value.filter((s) => s.status === 'running').length
  const parts = []
  if (waiting.value.length) parts.push(t('home.sum.waiting', { n: waiting.value.length }))
  if (running) parts.push(t('home.sum.running', { n: running }))
  return parts.length ? t('home.sum.has', { parts: parts.join(t('home.sum.and')) }) : t('home.sum.none')
})
const pill = (s) => ({ running: 'pill-wait', approved: 'pill-done', rejected: 'pill-stop' }[s.status])
</script>

<template>
  <h1 class="page-title">{{ greeting() }}, {{ givenName(auth.name) }}</h1>
  <p class="page-lead">{{ summary }}</p>

  <p v-if="ready.length" class="mt-4 flex flex-wrap items-center gap-3 rounded-md bg-pen-wash px-4 py-3 text-sm">
    <span>{{ t('ai.ready', { n: ready.length }) }}</span>
    <RouterLink to="/tro-ly" class="font-medium text-pen hover:underline">{{ t('ai.review') }}</RouterLink>
  </p>

  <p v-if="failed" class="mt-6 rounded-md bg-seal-wash px-4 py-3 text-sm text-seal" role="alert">
    {{ t('home.failed', { err: failed }) }}
  </p>

  <div v-if="submissions" class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div class="min-w-0 space-y-8">
      <section v-if="auth.role !== 'staff'" aria-labelledby="waiting-title">
        <h2 id="waiting-title" class="section-title">{{ t('home.waitTitle') }}</h2>
        <div v-if="waiting.length === 0" class="panel mt-3 flex items-center gap-3 px-4 py-5 text-pencil">
          <CircleCheck :size="20" class="text-done" aria-hidden="true" /> {{ t('home.waitDone') }}
        </div>
        <ul v-else class="panel mt-3">
          <li v-for="s in waiting" :key="s.id" class="panel-row items-start">
            <span class="avatar mt-0.5" aria-hidden="true">{{ initials(s.submitter_name) }}</span>
            <div class="min-w-[min(100%,15rem)] flex-1">
              <RouterLink :to="`/ho-so/${s.id}`" class="font-medium hover:text-pen hover:underline">{{ t('home.item', { name: s.app.name, no: s.no }) }}</RouterLink>
              <p class="text-sm text-pencil">{{ t('home.sentAgo', { who: s.submitter_name, when: ago(s.created_at), action: t(stepOf(s)?.type === 'task' ? 'act.do' : 'act.approve'), step: stepOf(s)?.name }) }}</p>
              <p class="num mt-1 text-sm font-medium">{{ headline(s) }}</p>
              <p v-if="suggestion(s)" class="sticky-note mt-2">{{ t('home.suggests') }} <strong>{{ t(suggestion(s).decision === 'approve' ? 'act.approve' : 'act.reject') }}</strong>: {{ suggestion(s).reason }}</p>
            </div>
            <DecisionBar :submission="s" @done="load" />
          </li>
        </ul>
      </section>

      <section aria-labelledby="mine-title">
        <h2 id="mine-title" class="section-title">{{ t('home.mineTitle') }}</h2>
        <div v-if="mine.length === 0" class="panel mt-3 px-4 py-5 text-pencil">
          {{ t('home.mineNone') }}
        </div>
        <div v-else class="panel mt-3">
          <RouterLink v-for="s in mine" :key="s.id" :to="`/ho-so/${s.id}`" class="panel-row">
            <CategoryIcon :category="s.app.category" />
            <div class="min-w-[min(100%,12rem)] flex-1">
              <div class="font-medium">{{ t('home.item', { name: s.app.name, no: s.no }) }}</div>
              <div class="num text-sm text-pencil">{{ headline(s) }}</div>
            </div>
            <span class="pill" :class="pill(s)">{{ whereIs(s) }}</span>
            <ChevronRight :size="18" class="hidden text-pencil sm:block" aria-hidden="true" />
          </RouterLink>
        </div>
      </section>
    </div>

    <section aria-labelledby="new-title">
      <h2 id="new-title" class="section-title">{{ t('home.newTitle') }}</h2>
      <div v-if="apps.length === 0" class="panel mt-3 px-4 py-5 text-sm text-pencil">
        {{ t('home.noProcess') }}
        <template v-if="auth.role === 'manager'"><RouterLink to="/soan" class="font-medium text-pen hover:underline">{{ t('home.firstProcess') }}</RouterLink>.</template>
        <template v-else>{{ t('home.askManager') }}</template>
      </div>
      <div v-else class="panel mt-3">
        <RouterLink v-for="app in apps" :key="app.key" :to="`/gui/${app.key}`" class="panel-row">
          <CategoryIcon :category="app.category" />
          <div class="min-w-[min(100%,12rem)] flex-1">
            <div class="font-medium">{{ app.name }}</div>
            <div class="text-xs text-pencil">{{ t('home.via', { route: routeText(app.spec) }) }}</div>
          </div>
        </RouterLink>
      </div>
    </section>
  </div>
  <p v-else-if="!failed" class="mt-8 text-pencil">{{ t('common.loading') }}</p>
</template>
