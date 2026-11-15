<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Quy trình được quản lý như mã nguồn mở: lịch sử phiên bản, đề xuất thay đổi (có kiểm tra tự động
và chạy thử trên hồ sơ cũ, người khác duyệt mới phát hành), góp ý / báo lỗi. Ai cũng xem được.
-->
<script setup>
import { computed, onMounted, onUnmounted, reactive, ref } from 'vue'
import { auth, gql, diffSpec, formatTime } from '../lib.js'
import SignatureRow from '../components/SignatureRow.vue'
import ProcessFlow from '../components/ProcessFlow.vue'

const apps = ref(null)
const selectedKey = ref('')
const error = ref('')
const reviewNotes = reactive({})
const issue = reactive({ title: '', body: '' })
let timer

const QUERY = `{ app(order_by: {name: asc}) {
  key name status spec
  versions(order_by: {version: desc}) { version spec note author_name reviewer_name created_at }
  changes(order_by: {id: desc}) { id name spec note status checks author_id author_name reviewer_name review_note created_at decided_at }
  issues(order_by: {id: desc}) { id title body status author_name created_at }
} }`

async function load() {
  try {
    apps.value = (await gql(QUERY)).app
    if (!selectedKey.value && apps.value.length) selectedKey.value = apps.value[0].key
  } catch (err) {
    error.value = `Không tải được dữ liệu: ${err.message}`
  }
}
onMounted(() => { load(); timer = setInterval(load, 3000) })
onUnmounted(() => clearInterval(timer))

const app = computed(() => apps.value?.find((a) => a.key === selectedKey.value))
const openChanges = computed(() => app.value?.changes.filter((c) => c.status === 'open') ?? [])
const decidedChanges = computed(() => app.value?.changes.filter((c) => c.status !== 'open') ?? [])
const canReview = (change) => auth.role === 'director' && change.author_id !== auth.userId
const passed = (change) => change.checks && change.checks.errors.length === 0

async function run(action) {
  error.value = ''
  try {
    await action()
    await load()
  } catch (err) {
    error.value = `Không thực hiện được: ${err.message}`
  }
}

const decide = (change, status) => run(() => gql(
  'mutation($id: bigint!, $s: String!, $n: String) { update_app_change_by_pk(pk_columns: {id: $id}, _set: {status: $s, review_note: $n}) { id } }',
  { id: change.id, s: status, n: reviewNotes[change.id] || null }))

const sendIssue = () => run(async () => {
  await gql('mutation($o: app_issue_insert_input!) { insert_app_issue_one(object: $o) { id } }',
    { o: { app_key: app.value.key, title: issue.title.trim(), body: issue.body.trim() || null } })
  issue.title = issue.body = ''
})

const closeIssue = (item) => run(() => gql(
  'mutation($id: bigint!) { update_app_issue_by_pk(pk_columns: {id: $id}, _set: {status: "closed"}) { id } }', { id: item.id }))

const KIND_STYLE = { add: 'text-done', remove: 'text-seal', change: 'text-wait' }
const KIND_MARK = { add: '+', remove: '−', change: '~' }
const hours = (h) => Math.abs(h) >= 24 ? `${(Math.abs(h) / 24).toFixed(1)} ngày` : `${Math.abs(h).toFixed(1)} giờ`
</script>

<template>
  <h1 class="page-title">Quy trình</h1>
  <p class="page-hint">Mỗi quy trình có lịch sử phiên bản, đề xuất thay đổi và góp ý công khai — như một dự án nguồn mở.</p>
  <p v-if="error" class="mt-4 rounded-lg bg-seal-wash p-3 text-sm text-seal" role="alert">{{ error }}</p>
  <p v-if="apps === null && !error" class="mt-6 text-sm text-pencil">Đang tải…</p>
  <p v-else-if="apps && apps.length === 0" class="panel p-5 mt-6 text-sm text-pencil">Chưa có quy trình nào.</p>

  <template v-if="app">
    <label class="label mt-6" for="process">Chọn quy trình</label>
    <select id="process" v-model="selectedKey" class="input max-w-md">
      <option v-for="a in apps" :key="a.key" :value="a.key">{{ a.name }}</option>
    </select>

    <section class="panel p-5 mt-4">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <h2 class="font-semibold">{{ app.name }}</h2>
        <span class="pill pill-wait">Phiên bản {{ app.versions[0]?.version ?? 1 }}</span>
      </div>
      <div class="mt-3"><ProcessFlow :spec="app.spec" /></div>
      <div class="mt-3"><SignatureRow :spec="app.spec" /></div>
    </section>

    <section class="mt-8">
      <h2 class="font-semibold">Đề xuất thay đổi đang mở <span class="pill ml-1 pill-wait">{{ openChanges.length }}</span></h2>
      <p v-if="openChanges.length === 0" class="panel p-5 mt-3 text-sm text-pencil">
        Không có đề xuất nào. Trưởng phòng có thể mở đề xuất từ mục “Soạn quy trình” bằng cách sửa quy trình này.
      </p>
      <article v-for="change in openChanges" :key="change.id" class="panel p-5 mt-3">
        <div class="flex flex-wrap items-baseline justify-between gap-2">
          <h3 class="font-semibold">#{{ change.id }} · {{ change.note }}</h3>
          <span class="text-xs text-pencil">{{ change.author_name }} · {{ formatTime(change.created_at) }}</span>
        </div>

        <h4 class="mt-4 text-sm font-medium text-ink">Thay đổi so với phiên bản đang chạy</h4>
        <ul class="mt-1 space-y-0.5 font-mono text-sm">
          <li v-for="(line, i) in diffSpec(app.spec, change.spec)" :key="i" :class="KIND_STYLE[line.kind]">{{ KIND_MARK[line.kind] }} {{ line.text }}</li>
        </ul>
        <div class="mt-3 text-sm font-medium text-ink">Quy trình sau khi thay đổi</div>
        <div class="mt-2"><SignatureRow :spec="change.spec" /></div>

        <h4 class="mt-4 text-sm font-medium text-ink">Kiểm tra tự động</h4>
        <p v-if="!change.checks" class="mt-1 text-sm text-pencil">Đang kiểm tra…</p>
        <template v-else>
          <ul v-if="change.checks.errors.length" class="mt-1 list-disc pl-5 text-sm text-seal">
            <li v-for="e in change.checks.errors" :key="e">{{ e }}</li>
          </ul>
          <div v-else class="mt-1 text-sm">
            <p class="text-done">✓ Cấu hình hợp lệ, biên dịch được.</p>
            <p class="mt-1">
              Chạy thử trên <strong>{{ change.checks.simulation.total }}</strong> hồ sơ đã có:
              <strong>{{ change.checks.simulation.changed }}</strong> hồ sơ sẽ đi đường khác.
              <template v-if="change.checks.simulation.savedHoursPerSubmission">
                Thời gian chờ ước tính
                {{ change.checks.simulation.savedHoursPerSubmission > 0 ? 'giảm' : 'tăng' }}
                <strong>{{ hours(change.checks.simulation.savedHoursPerSubmission) }}</strong> mỗi hồ sơ.
              </template>
            </p>
            <table v-if="change.checks.simulation.steps.length" class="mt-2 w-full max-w-lg text-left text-sm">
              <thead class="text-xs text-pencil"><tr><th class="py-1 font-medium">Bước</th><th class="font-medium">Số hồ sơ đi qua (trước → sau)</th><th class="font-medium">Xử lý trung bình</th></tr></thead>
              <tbody>
                <tr v-for="s in change.checks.simulation.steps" :key="s.key" class="border-t border-line">
                  <td class="py-1">{{ s.name }}</td>
                  <td :class="{ 'font-semibold text-wait': s.before !== s.after }">{{ s.before }} → {{ s.after }}</td>
                  <td class="text-pencil">{{ s.avgHours ? hours(s.avgHours) : '—' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </template>

        <div v-if="canReview(change)" class="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <input v-model="reviewNotes[change.id]" class="input max-w-xs" placeholder="Nhận xét (không bắt buộc)" aria-label="Nhận xét" />
          <button class="btn-primary" :disabled="!passed(change)" @click="decide(change, 'merged')">Chấp nhận và phát hành</button>
          <button class="btn-danger" @click="decide(change, 'rejected')">Từ chối</button>
        </div>
        <p v-else class="mt-4 border-t border-line pt-3 text-xs text-pencil">
          Giám đốc (không phải người đề xuất) xem xét và quyết định.
        </p>
      </article>
    </section>

    <section class="mt-8">
      <h2 class="font-semibold">Lịch sử phiên bản</h2>
      <ol class="mt-3 space-y-3">
        <li v-for="(v, i) in app.versions" :key="v.version" class="panel p-5">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h3 class="font-semibold">v{{ v.version }} · {{ v.note }}</h3>
            <span class="text-xs text-pencil">
              {{ v.author_name }}<template v-if="v.reviewer_name"> · duyệt bởi {{ v.reviewer_name }}</template> · {{ formatTime(v.created_at) }}
            </span>
          </div>
          <ul v-if="app.versions[i + 1]" class="mt-2 space-y-0.5 font-mono text-sm">
            <li v-for="(line, j) in diffSpec(app.versions[i + 1].spec, v.spec)" :key="j" :class="KIND_STYLE[line.kind]">{{ KIND_MARK[line.kind] }} {{ line.text }}</li>
          </ul>
        </li>
      </ol>
      <ul v-if="decidedChanges.some((c) => c.status === 'rejected')" class="mt-3 space-y-1 text-sm text-pencil">
        <li v-for="c in decidedChanges.filter((x) => x.status === 'rejected')" :key="c.id">
          Đề xuất #{{ c.id }} “{{ c.note }}” bị {{ c.reviewer_name }} từ chối<template v-if="c.review_note">: {{ c.review_note }}</template>
        </li>
      </ul>
    </section>

    <section class="mt-8">
      <h2 class="font-semibold">Góp ý và báo lỗi quy trình</h2>
      <form class="panel p-5 mt-3 space-y-3" @submit.prevent="sendIssue">
        <div>
          <label class="label" for="issue-title">Bạn thấy quy trình này vướng ở đâu?</label>
          <input id="issue-title" v-model="issue.title" class="input" placeholder="Ví dụ: Bước giám đốc duyệt thường chờ hơn 3 ngày" />
        </div>
        <textarea v-model="issue.body" class="input" rows="2" placeholder="Mô tả thêm (không bắt buộc)" aria-label="Mô tả thêm" />
        <button class="btn-quiet" :disabled="issue.title.trim().length < 5">Gửi góp ý</button>
      </form>
      <article v-for="item in app.issues" :key="item.id" class="panel p-5 mt-3">
        <div class="flex flex-wrap items-center justify-between gap-2">
          <h3 class="font-medium" :class="{ 'text-slate-400 line-through': item.status === 'closed' }">#{{ item.id }} · {{ item.title }}</h3>
          <span class="chip" :class="item.status === 'open' ? 'pill-wait' : 'pill-plain'">{{ item.status === 'open' ? 'Đang mở' : 'Đã xử lý' }}</span>
        </div>
        <p v-if="item.body" class="mt-1 text-sm text-pencil">{{ item.body }}</p>
        <div class="mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-pencil">
          <span>{{ item.author_name }} · {{ formatTime(item.created_at) }}</span>
          <button v-if="item.status === 'open' && ['manager', 'director'].includes(auth.role)" class="text-pen hover:underline" @click="closeIssue(item)">Đánh dấu đã xử lý</button>
        </div>
      </article>
    </section>
  </template>
</template>
