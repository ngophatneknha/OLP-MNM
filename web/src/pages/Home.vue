<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Bàn làm việc: việc đang chờ tôi đứng đầu, sau đó là hồ sơ tôi đã gửi và lối tắt để gửi hồ sơ mới.
-->
<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { ChevronRight, CircleCheck } from 'lucide-vue-next'
import { auth, gql, ago, givenName, initials, headline, whereIs, waitsOnMe, stepOf, routeText, SUBMISSION_FIELDS } from '../lib.js'
import DecisionBar from '../components/DecisionBar.vue'
import CategoryIcon from '../components/CategoryIcon.vue'

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
onMounted(() => { load(); timer = setInterval(load, 3000) })
onUnmounted(() => clearInterval(timer))

const waiting = computed(() => (submissions.value ?? []).filter(waitsOnMe))
const mine = computed(() => (submissions.value ?? []).filter((s) => s.submitter_id === auth.userId))

const hour = new Date().getHours()
const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối'
const summary = computed(() => {
  if (submissions.value === null) return ''
  const running = mine.value.filter((s) => s.status === 'running').length
  const parts = []
  if (waiting.value.length) parts.push(`${waiting.value.length} hồ sơ đang chờ bạn xử lý`)
  if (running) parts.push(`${running} hồ sơ của bạn đang được xem xét`)
  return parts.length ? `Có ${parts.join(' và ')}.` : 'Hôm nay chưa có việc nào chờ bạn.'
})
const pill = (s) => ({ running: 'pill-wait', approved: 'pill-done', rejected: 'pill-stop' }[s.status])
</script>

<template>
  <h1 class="page-title">{{ greeting }}, {{ givenName(auth.name) }}</h1>
  <p class="page-lead">{{ summary }}</p>

  <p v-if="failed" class="mt-6 rounded-md bg-seal-wash px-4 py-3 text-sm text-seal" role="alert">
    Không tải được dữ liệu ({{ failed }}). Trang sẽ tự thử lại sau vài giây.
  </p>

  <div v-if="submissions" class="mt-8 grid gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
    <div class="min-w-0 space-y-8">
      <section v-if="auth.role !== 'staff'" aria-labelledby="waiting-title">
        <h2 id="waiting-title" class="section-title">Chờ bạn xử lý</h2>
        <div v-if="waiting.length === 0" class="panel mt-3 flex items-center gap-3 px-4 py-5 text-pencil">
          <CircleCheck :size="20" class="text-done" aria-hidden="true" /> Bạn đã xử lý hết. Hồ sơ mới sẽ hiện ở đây ngay khi được gửi tới.
        </div>
        <ul v-else class="panel mt-3">
          <li v-for="s in waiting" :key="s.id" class="panel-row items-start">
            <span class="avatar mt-0.5" aria-hidden="true">{{ initials(s.submitter_name) }}</span>
            <div class="min-w-[min(100%,15rem)] flex-1">
              <RouterLink :to="`/ho-so/${s.id}`" class="font-medium hover:text-pen hover:underline">{{ s.app.name }}, hồ sơ số {{ s.no }}</RouterLink>
              <p class="text-sm text-pencil">{{ s.submitter_name }} gửi {{ ago(s.created_at) }}. Cần bạn {{ stepOf(s)?.type === 'task' ? 'thực hiện' : 'duyệt' }} ở bước “{{ stepOf(s)?.name }}”.</p>
              <p class="num mt-1 text-sm font-medium">{{ headline(s) }}</p>
            </div>
            <DecisionBar :submission="s" @done="load" />
          </li>
        </ul>
      </section>

      <section aria-labelledby="mine-title">
        <h2 id="mine-title" class="section-title">Hồ sơ bạn đã gửi</h2>
        <div v-if="mine.length === 0" class="panel mt-3 px-4 py-5 text-pencil">
          Bạn chưa gửi hồ sơ nào. Chọn một loại hồ sơ ở mục “Gửi hồ sơ mới” để bắt đầu.
        </div>
        <div v-else class="panel mt-3">
          <RouterLink v-for="s in mine" :key="s.id" :to="`/ho-so/${s.id}`" class="panel-row">
            <CategoryIcon :category="s.app.category" />
            <div class="min-w-[min(100%,12rem)] flex-1">
              <div class="font-medium">{{ s.app.name }}, hồ sơ số {{ s.no }}</div>
              <div class="num text-sm text-pencil">{{ headline(s) }}</div>
            </div>
            <span class="pill" :class="pill(s)">{{ whereIs(s) }}</span>
            <ChevronRight :size="18" class="hidden text-pencil sm:block" aria-hidden="true" />
          </RouterLink>
        </div>
      </section>
    </div>

    <section aria-labelledby="new-title">
      <h2 id="new-title" class="section-title">Gửi hồ sơ mới</h2>
      <div v-if="apps.length === 0" class="panel mt-3 px-4 py-5 text-sm text-pencil">
        Chưa có quy trình nào được xuất bản.
        <template v-if="auth.role === 'manager'"><RouterLink to="/soan" class="font-medium text-pen hover:underline">Soạn quy trình đầu tiên</RouterLink>.</template>
        <template v-else>Trưởng phòng có thể soạn quy trình đầu tiên.</template>
      </div>
      <div v-else class="panel mt-3">
        <RouterLink v-for="app in apps" :key="app.key" :to="`/gui/${app.key}`" class="panel-row">
          <CategoryIcon :category="app.category" />
          <div class="min-w-[min(100%,12rem)] flex-1">
            <div class="font-medium">{{ app.name }}</div>
            <div class="text-xs text-pencil">Qua {{ routeText(app.spec) }}</div>
          </div>
        </RouterLink>
      </div>
    </section>
  </div>
  <p v-else-if="!failed" class="mt-8 text-pencil">Đang tải…</p>
</template>
