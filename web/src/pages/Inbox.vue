<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Hộp việc: hồ sơ đang chờ vai trò của tôi xử lý và hồ sơ tôi đã gửi. Sơ đồ cập nhật theo trạng thái thật.
-->
<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { auth, gql, formatValue, formatTime, ROLE_LABEL, STATUS_LABEL } from '../lib.js'
import FlowDiagram from '../components/FlowDiagram.vue'

const submissions = ref(null)
const notes = reactive({})
const busy = ref('')
const error = ref('')
let timer

const QUERY = `{ submission(order_by: {created_at: desc}, limit: 50) {
  id data status current_step waiting_role submitter_id created_at
  app { name spec }
  events(order_by: {id: asc}) { step_key action note created_at }
} }`

async function load() {
  try {
    submissions.value = (await gql(QUERY)).submission
  } catch (err) {
    error.value = `Không tải được dữ liệu: ${err.message}`
  }
}

// shortcut: hỏi lại máy chủ mỗi 3 giây thay cho GraphQL subscription, vì trình duyệt không gửi được
// header Authorization khi mở WebSocket qua gateway; chuyển sang subscription khi gateway nhận token qua giao thức con.
onMounted(() => { load(); timer = setInterval(load, 3000) })
onUnmounted(() => clearInterval(timer))

const waiting = computed(() => (submissions.value ?? []).filter(
  (s) => s.status === 'running' && s.waiting_role === auth.role && s.submitter_id !== auth.userId))
const mine = computed(() => (submissions.value ?? []).filter((s) => s.submitter_id === auth.userId))
const step = (s) => s.app.spec.steps.find((x) => x.key === s.current_step)

async function act(submission, action) {
  busy.value = submission.id
  error.value = ''
  try {
    await gql(
      'mutation($o: submission_event_insert_input!) { insert_submission_event_one(object: $o) { id } }',
      { o: { submission_id: submission.id, step_key: submission.current_step, action, note: notes[submission.id] || null } })
    await load()
  } catch (err) {
    error.value = `Không thực hiện được: ${err.message}`
  } finally {
    busy.value = ''
  }
}

const STATUS_STYLE = { running: 'bg-indigo-100 text-indigo-700', approved: 'bg-emerald-100 text-emerald-700', rejected: 'bg-rose-100 text-rose-700' }
const ACTION_LABEL = { approve: 'đã duyệt', reject: 'đã từ chối', done: 'đã hoàn tất' }
const stepName = (s, key) => s.app.spec.steps.find((x) => x.key === key)?.name ?? key
</script>

<template>
  <h1 class="page-title">Việc của tôi</h1>
  <p class="page-hint">Bạn đang làm việc với vai trò {{ ROLE_LABEL[auth.role] }}.</p>
  <p v-if="error" class="mt-4 rounded-lg bg-rose-50 p-3 text-sm text-rose-700" role="alert">{{ error }}</p>
  <p v-if="submissions === null && !error" class="mt-6 text-sm text-slate-500">Đang tải…</p>

  <template v-if="submissions">
    <section v-if="auth.role !== 'staff'" class="mt-6">
      <h2 class="font-semibold">Chờ tôi xử lý <span class="chip ml-1 bg-indigo-100 text-indigo-700">{{ waiting.length }}</span></h2>
      <p v-if="waiting.length === 0" class="card mt-3 text-sm text-slate-600">Không có hồ sơ nào đang chờ bạn.</p>
      <article v-for="s in waiting" :key="s.id" class="card mt-3">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="font-semibold">{{ s.app.name }} — {{ step(s)?.name }}</h3>
          <time class="text-xs text-slate-500">Gửi lúc {{ formatTime(s.created_at) }}</time>
        </div>
        <dl class="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div v-for="field in s.app.spec.fields" :key="field.key">
            <dt class="text-slate-500">{{ field.label }}</dt>
            <dd class="font-medium">{{ formatValue(field, s.data[field.key]) }}</dd>
          </div>
        </dl>
        <div class="mt-4"><FlowDiagram :spec="s.app.spec" :submission="s" /></div>
        <div class="mt-4 flex flex-wrap items-center gap-2">
          <input v-model="notes[s.id]" class="input max-w-xs" placeholder="Ghi chú (không bắt buộc)" aria-label="Ghi chú" />
          <template v-if="step(s)?.type === 'task'">
            <button class="btn-primary" :disabled="busy === s.id" @click="act(s, 'done')">Đã thực hiện xong</button>
          </template>
          <template v-else>
            <button class="btn-primary" :disabled="busy === s.id" @click="act(s, 'approve')">Duyệt</button>
            <button class="btn-danger" :disabled="busy === s.id" @click="act(s, 'reject')">Từ chối</button>
          </template>
        </div>
      </article>
    </section>

    <section class="mt-8">
      <h2 class="font-semibold">Hồ sơ tôi đã gửi</h2>
      <p v-if="mine.length === 0" class="card mt-3 text-sm text-slate-600">
        Bạn chưa gửi hồ sơ nào. Vào mục <RouterLink to="/apps" class="text-indigo-700 hover:underline">Ứng dụng</RouterLink> để bắt đầu.
      </p>
      <article v-for="s in mine" :key="s.id" class="card mt-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-semibold">{{ s.app.name }}</h3>
          <span class="chip" :class="STATUS_STYLE[s.status]">
            {{ STATUS_LABEL[s.status] }}<template v-if="s.status === 'running' && s.waiting_role"> · chờ {{ ROLE_LABEL[s.waiting_role] }}</template>
          </span>
        </div>
        <p class="mt-1 text-sm text-slate-600">
          <template v-for="(field, i) in s.app.spec.fields" :key="field.key">
            <template v-if="i"> · </template>{{ field.label }}: <span class="font-medium text-slate-900">{{ formatValue(field, s.data[field.key]) }}</span>
          </template>
        </p>
        <div class="mt-4"><FlowDiagram :spec="s.app.spec" :submission="s" /></div>
        <ul v-if="s.events.length" class="mt-3 space-y-1 text-xs text-slate-500">
          <li v-for="e in s.events" :key="e.created_at + e.step_key">
            {{ formatTime(e.created_at) }} — {{ stepName(s, e.step_key) }}: {{ ACTION_LABEL[e.action] }}<template v-if="e.note"> (“{{ e.note }}”)</template>
          </li>
        </ul>
      </article>
    </section>
  </template>
</template>
