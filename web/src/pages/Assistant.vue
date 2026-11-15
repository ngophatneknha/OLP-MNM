<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Trợ lý AI "thử việc" (không gian [I]): ở mỗi bước duyệt, AI đi từ chạy bóng tới tự duyệt, nhưng chỉ khi có bằng chứng
khớp với quyết định của người. Giám đốc nâng nấc; trưởng phòng và giám đốc đều hạ nấc được bất cứ lúc nào.
-->
<script setup>
import { computed, onMounted, ref } from 'vue'
import { ArrowDown, ArrowUp, Check, X } from 'lucide-vue-next'
import { auth, gql, ago, toast, ROLE_LABEL, AUTONOMY } from '../lib.js'
import { MIN_DECISIONS, MIN_RATE, canRaise, evidence as evidenceOf } from '../autonomy.js'

const apps = ref(null)
const rows = ref([])
const opinions = ref([])
const isDirector = computed(() => auth.role === 'director')

async function load() {
  const data = await gql(`{
    app(where: {status: {_eq: "published"}}, order_by: {name: asc}) { key name spec }
    step_autonomy { app_key step_key level updated_by updated_at }
    ${isDirector.value ? 'ai_opinion(order_by: {id: desc}, limit: 400) { step_key level decision reason human_action matched sample created_at submission { id no app_key } }' : ''}
  }`)
  apps.value = data.app
  rows.value = data.step_autonomy
  opinions.value = data.ai_opinion ?? []
}
onMounted(load)

const levelOf = (appKey, stepKey) => rows.value.find((r) => r.app_key === appKey && r.step_key === stepKey)
const evidence = (appKey, stepKey, level) => evidenceOf(opinions.value, appKey, stepKey, level)

const sections = computed(() => (apps.value ?? []).map((app) => ({
  app,
  steps: app.spec.steps.filter((s) => s.type !== 'task').map((step) => {
    const row = levelOf(app.key, step.key)
    const level = row?.level ?? 1
    return { step, level, row, ev: evidence(app.key, step.key, level) }
  }),
})).filter((s) => s.steps.length))

async function setLevel(app, item, level) {
  try {
    await gql('mutation($a: String!, $s: String!, $l: Int!) { update_step_autonomy_by_pk(pk_columns: {app_key: $a, step_key: $s}, _set: {level: $l}) { level } }',
      { a: app.key, s: item.step.key, l: level })
    toast(level > item.level ? `Đã nâng “${item.step.name}” lên: ${AUTONOMY[level].name}` : `Đã hạ “${item.step.name}” xuống: ${AUTONOMY[level].name}`)
    await load()
  } catch (err) {
    toast(err.message, false)
  }
}

const recent = computed(() => opinions.value.filter((o) => o.matched !== null).slice(0, 8))
</script>

<template>
  <h1 class="page-title">Trợ lý AI</h1>
  <p class="page-lead">
    Trợ lý được giao việc dần dần, như một nhân viên mới. Ở mỗi bước duyệt, nó chỉ được lên nấc khi quyết định của nó khớp với quyết định của người
    (ít nhất {{ MIN_DECISIONS }} hồ sơ, từ {{ MIN_RATE * 100 }}% khớp), và chỉ giám đốc mới được nâng nấc.
  </p>

  <ol class="panel mt-6 divide-y divide-line">
    <li v-for="(a, level) in AUTONOMY.slice(1)" :key="level" class="flex gap-3 px-4 py-3">
      <span class="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-pen-wash text-sm font-semibold text-pen">{{ level + 1 }}</span>
      <div><div class="font-medium">{{ a.name }}</div><div class="text-sm text-pencil">{{ a.help }}</div></div>
    </li>
  </ol>

  <p v-if="apps === null" class="mt-8 text-pencil">Đang tải…</p>
  <p v-else-if="!sections.length" class="panel mt-8 px-4 py-5 text-pencil">Chưa có bước duyệt nào để giao việc cho trợ lý. Hãy xuất bản một quy trình trước.</p>
  <p v-if="!isDirector && apps" class="hint mt-4">Bằng chứng khớp chỉ giám đốc xem được. Bạn có thể hạ nấc của trợ lý bất cứ lúc nào nếu thấy nó làm chưa tốt.</p>

  <section v-for="s in sections" :key="s.app.key" class="mt-8" :aria-label="s.app.name">
    <h2 class="section-title">{{ s.app.name }}</h2>
    <ul class="panel mt-3">
      <li v-for="item in s.steps" :key="item.step.key" class="panel-row items-start">
        <div class="min-w-[min(100%,13rem)] flex-1">
          <div class="font-medium">{{ item.step.name }}</div>
          <div class="text-xs text-pencil">{{ ROLE_LABEL[item.step.role] }}</div>
          <span class="pill mt-2" :class="item.level >= 3 ? 'pill-done' : item.level === 2 ? 'pill-wait' : 'pill-plain'">Nấc {{ item.level }}: {{ AUTONOMY[item.level].name }}</span>
        </div>

        <div v-if="isDirector && item.level >= 2" class="min-w-[min(100%,13rem)] flex-1 text-sm">
          <div class="num">Khớp <strong>{{ item.ev.hits }}/{{ item.ev.total }}</strong> quyết định<template v-if="item.ev.total"> ({{ Math.round(item.ev.hits / item.ev.total * 100) }}%)</template></div>
          <div class="mt-1 h-2 overflow-hidden rounded-full bg-ground"><div class="h-full rounded-full" :class="canRaise(item.ev, item.level) ? 'bg-done' : 'bg-pen'" :style="{ width: `${Math.min(100, item.ev.total / MIN_DECISIONS * 100)}%` }" /></div>
          <div class="mt-1 text-xs text-pencil">{{ item.level >= 4 ? 'Đã ở nấc cao nhất.' : canRaise(item.ev, item.level) ? 'Đủ bằng chứng để nâng nấc.' : `Cần ${MIN_DECISIONS} quyết định, từ ${MIN_RATE * 100}% khớp.` }}</div>
        </div>

        <div class="flex gap-2">
          <button v-if="isDirector && item.level < 4" class="btn-primary" :disabled="!canRaise(item.ev, item.level)" @click="setLevel(s.app, item, item.level + 1)"><ArrowUp :size="16" aria-hidden="true" /> Nâng nấc</button>
          <button v-if="item.level > 1" class="btn-quiet" @click="setLevel(s.app, item, item.level - 1)"><ArrowDown :size="16" aria-hidden="true" /> Hạ nấc</button>
        </div>
      </li>
    </ul>
  </section>

  <section v-if="recent.length" class="mt-10" aria-labelledby="recent-title">
    <h2 id="recent-title" class="section-title">Những lần gần đây: trợ lý so với người</h2>
    <ul class="panel mt-3">
      <li v-for="(o, i) in recent" :key="i" class="panel-row">
        <span class="grid h-7 w-7 shrink-0 place-items-center rounded-full" :class="o.matched ? 'bg-done-wash text-done' : 'bg-seal-wash text-seal'">
          <Check v-if="o.matched" :size="16" aria-label="Khớp" /><X v-else :size="16" aria-label="Không khớp" />
        </span>
        <div class="min-w-[min(100%,14rem)] flex-1">
          <RouterLink :to="`/ho-so/${o.submission.id}`" class="font-medium hover:text-pen hover:underline">Hồ sơ số {{ o.submission.no }}</RouterLink>
          <div class="text-sm text-pencil">Trợ lý {{ o.decision === 'approve' ? 'nghiêng về duyệt' : 'nghiêng về từ chối' }}: {{ o.reason }}</div>
        </div>
        <span class="text-sm text-pencil">Người {{ o.human_action === 'approve' ? 'đã duyệt' : 'đã từ chối' }} · {{ ago(o.created_at) }}</span>
      </li>
    </ul>
  </section>
</template>
