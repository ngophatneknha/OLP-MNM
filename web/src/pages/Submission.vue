<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Một hồ sơ: nội dung đã khai, hàng ô ký cho biết đang ở đâu, và nhật ký kể lại ai đã làm gì.
-->
<script setup>
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, Download, Paperclip } from 'lucide-vue-next'
import { auth, gql, formatValue, formatTime, whereIs, waitsOnMe, stepOf, suggestion, ROLE_LABEL, SUBMISSION_FIELDS, uploadFile, downloadFile, formatSize, toast } from '../lib.js'
import SignatureRow from '../components/SignatureRow.vue'
import DecisionBar from '../components/DecisionBar.vue'

const route = useRoute()
const submission = ref(undefined) // undefined: đang tải; null: không tìm thấy hoặc không có quyền xem
let timer

async function load() {
  try {
    submission.value = (await gql(`query($id: uuid!) { submission_by_pk(id: $id) { ${SUBMISSION_FIELDS} } }`, { id: route.params.id })).submission_by_pk
  } catch {
    submission.value = null
  }
}
onMounted(() => { load(); timer = setInterval(load, 3000) })
onUnmounted(() => clearInterval(timer))
watch(() => route.params.id, load)

const canAttach = () => submission.value.submitter_id === auth.userId || waitsOnMe(submission.value)
async function attach(event) {
  for (const file of event.target.files) {
    try { await uploadFile(submission.value.id, file); toast(`Đã đính kèm “${file.name}”`) } catch (err) { toast(err.message, false) }
  }
  event.target.value = ''
  load()
}
const save = (file) => downloadFile(file).catch((err) => toast(err.message, false))

const VERB = { approve: 'đã duyệt', reject: 'không duyệt', done: 'đã hoàn tất' }
const stepName = (key) => submission.value.version.spec.steps.find((s) => s.key === key)?.name ?? key
const pill = (s) => ({ running: 'pill-wait', approved: 'pill-done', rejected: 'pill-stop' }[s.status])
</script>

<template>
  <RouterLink to="/" class="inline-flex items-center gap-1.5 text-sm text-pencil hover:text-pen"><ArrowLeft :size="16" aria-hidden="true" /> Bàn làm việc</RouterLink>

  <p v-if="submission === undefined" class="mt-6 text-pencil">Đang tải…</p>
  <div v-else-if="submission === null" class="panel mt-6 px-4 py-5">
    <h1 class="section-title">Không mở được hồ sơ này</h1>
    <p class="mt-1 text-pencil">Hồ sơ không tồn tại, hoặc bạn không phải người gửi hay người xử lý của nó.</p>
  </div>

  <template v-else>
    <div class="mt-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="font-serif text-2xl font-bold">{{ submission.app.name }}</h1>
        <p class="text-pencil">Hồ sơ số {{ submission.no }}, do {{ submission.submitter_name }} gửi lúc {{ formatTime(submission.created_at) }}</p>
      </div>
      <span class="pill mt-1" :class="pill(submission)">{{ whereIs(submission) }}</span>
    </div>

    <section v-if="waitsOnMe(submission)" class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pen/30 bg-pen-wash px-4 py-3" aria-label="Việc cần bạn làm">
      <p class="font-medium">
        Hồ sơ đang chờ bạn {{ stepOf(submission)?.type === 'task' ? 'thực hiện' : 'duyệt' }} ở bước “{{ stepOf(submission)?.name }}”.
      </p>
      <DecisionBar :submission="submission" @done="load" />
    </section>

    <p v-if="suggestion(submission)" class="sticky-note mt-3 max-w-2xl">Trợ lý gợi ý <strong>{{ suggestion(submission).decision === 'approve' ? 'duyệt' : 'từ chối' }}</strong>: {{ suggestion(submission).reason }} <span class="text-xs">Quyết định vẫn là của bạn.</span></p>

    <section class="mt-6" aria-labelledby="content-title">
      <h2 id="content-title" class="section-title">Nội dung</h2>
      <dl class="panel mt-3">
        <div v-for="field in submission.version.spec.fields" :key="field.key" class="panel-row items-baseline">
          <dt class="w-full text-sm text-pencil sm:w-56">{{ field.label }}</dt>
          <dd class="num min-w-0 flex-1 whitespace-pre-line font-medium">{{ formatValue(field, submission.data[field.key]) }}</dd>
        </div>
      </dl>
    </section>

    <section class="mt-8" aria-labelledby="files-title">
      <h2 id="files-title" class="section-title">Tệp đính kèm</h2>
      <ul class="panel mt-3">
        <li v-for="file in submission.attachments" :key="file.id" class="panel-row">
          <Paperclip :size="16" class="text-pencil" aria-hidden="true" />
          <div class="min-w-[min(100%,10rem)] flex-1"><div class="font-medium">{{ file.name }}</div><div class="num text-xs text-pencil">{{ formatSize(file.size) }} · {{ file.uploader_name }} · {{ formatTime(file.created_at) }}</div></div>
          <button class="btn-quiet" @click="save(file)"><Download :size="16" aria-hidden="true" /> Tải về</button>
        </li>
        <li v-if="!submission.attachments.length" class="panel-row text-pencil">Chưa có tệp nào.</li>
      </ul>
      <label v-if="canAttach()" class="btn-quiet mt-3 cursor-pointer"><Paperclip :size="16" aria-hidden="true" /> Thêm tệp<input type="file" multiple class="sr-only" @change="attach" /></label>
    </section>

    <section class="mt-8" aria-labelledby="sign-title">
      <h2 id="sign-title" class="section-title">Chữ ký</h2>
      <div class="mt-3"><SignatureRow :spec="submission.version.spec" :submission="submission" /></div>
      <p class="hint">Hồ sơ đi theo phiên bản {{ submission.app_version }} của quy trình, là phiên bản có hiệu lực lúc gửi.</p>
    </section>

    <section class="mt-8" aria-labelledby="log-title">
      <h2 id="log-title" class="section-title">Nhật ký</h2>
      <ol class="panel mt-3">
        <li class="panel-row items-baseline">
          <time class="num w-32 shrink-0 text-sm text-pencil">{{ formatTime(submission.created_at) }}</time>
          <span>{{ submission.submitter_name }} gửi hồ sơ.</span>
        </li>
        <li v-for="e in submission.events" :key="e.created_at + e.step_key" class="panel-row items-baseline">
          <time class="num w-32 shrink-0 text-sm text-pencil">{{ formatTime(e.created_at) }}</time>
          <span class="min-w-0 flex-1">
            {{ e.actor_name }} {{ VERB[e.action] }} ở bước “{{ stepName(e.step_key) }}”.
            <template v-if="e.note">Ghi chú: {{ e.note }}</template>
          </span>
        </li>
        <li v-if="submission.status === 'running' && submission.waiting_role" class="panel-row items-baseline text-pencil">
          <span class="w-32 shrink-0 text-sm">Tiếp theo</span>
          <span>{{ ROLE_LABEL[submission.waiting_role] }} {{ stepOf(submission)?.type === 'task' ? 'thực hiện' : 'duyệt' }} bước “{{ stepOf(submission)?.name }}”.</span>
        </li>
      </ol>
    </section>
  </template>
</template>
