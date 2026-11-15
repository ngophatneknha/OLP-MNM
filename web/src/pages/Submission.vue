<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Một hồ sơ: nội dung đã khai, hàng ô ký cho biết đang ở đâu, và nhật ký kể lại ai đã làm gì.
-->
<script setup>
import { live } from '../live.js'
import { onMounted, onUnmounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ArrowLeft, Download, Paperclip } from 'lucide-vue-next'
import { auth, gql, formatValue, formatTime, whereIs, waitsOnMe, stepOf, suggestion, ROLE_LABEL, SUBMISSION_FIELDS, uploadFile, downloadFile, getJson, formatSize, toast } from '../lib.js'
import SignatureRow from '../components/SignatureRow.vue'
import DecisionBar from '../components/DecisionBar.vue'
import ProcessFlow from '../components/ProcessFlow.vue'
import { t } from '../i18n.js'

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
onMounted(() => { load(); timer = live(load) })
onUnmounted(() => timer?.())
watch(() => route.params.id, load)

// Chữ ký số: gọi bridge kiểm chứng lại từng chữ ký với CA của tổ chức mỗi khi hồ sơ đổi.
const sigs = ref(null)
watch(() => submission.value?.events?.length, async (n) => {
  if (n === undefined) return
  try { sigs.value = (await getJson(`/signatures/verify?submission=${route.params.id}`)).filter((e) => e.signed) } catch { sigs.value = null }
}, { immediate: true })

const canAttach = () => submission.value.submitter_id === auth.userId || waitsOnMe(submission.value)
async function attach(event) {
  for (const file of event.target.files) {
    try { await uploadFile(submission.value.id, file); toast(t('sub.attached', { name: file.name })) } catch (err) { toast(err.message, false) }
  }
  event.target.value = ''
  load()
}
const save = (file) => downloadFile(file).catch((err) => toast(err.message, false))

const stepName = (key) => submission.value.version.spec.steps.find((s) => s.key === key)?.name ?? key
const pill = (s) => ({ running: 'pill-wait', approved: 'pill-done', rejected: 'pill-stop' }[s.status])
</script>

<template>
  <RouterLink to="/" class="inline-flex items-center gap-1.5 text-sm text-pencil hover:text-pen"><ArrowLeft :size="16" aria-hidden="true" /> {{ t('nav.home') }}</RouterLink>

  <p v-if="submission === undefined" class="mt-6 text-pencil">{{ t('common.loading') }}</p>
  <div v-else-if="submission === null" class="panel mt-6 px-4 py-5">
    <h1 class="section-title">{{ t('sub.notFoundTitle') }}</h1>
    <p class="mt-1 text-pencil">{{ t('sub.notFound') }}</p>
  </div>

  <template v-else>
    <div class="mt-4 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 class="font-serif text-2xl font-bold">{{ submission.app.name }}</h1>
        <p class="text-pencil">{{ t('sub.meta', { no: submission.no, who: submission.submitter_name, when: formatTime(submission.created_at) }) }}</p>
      </div>
      <span class="pill mt-1" :class="pill(submission)">{{ whereIs(submission) }}</span>
    </div>

    <section v-if="waitsOnMe(submission)" class="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-pen/30 bg-pen-wash px-4 py-3" :aria-label="t('sub.aria.todo')">
      <p class="font-medium">
        {{ t('sub.needsYou', { action: t(stepOf(submission)?.type === 'task' ? 'act.do' : 'act.approve'), step: stepOf(submission)?.name }) }}
      </p>
      <DecisionBar :submission="submission" @done="load" />
    </section>

    <p v-if="suggestion(submission)" class="sticky-note mt-3 max-w-2xl">{{ t('home.suggests') }} <strong>{{ t(suggestion(submission).decision === 'approve' ? 'act.approve' : 'act.reject') }}</strong>: {{ suggestion(submission).reason }} <span class="text-xs">{{ t('sub.yours') }}</span></p>

    <section class="mt-6" aria-labelledby="content-title">
      <h2 id="content-title" class="section-title">{{ t('sub.content') }}</h2>
      <dl class="panel mt-3">
        <div v-for="field in submission.version.spec.fields" :key="field.key" class="panel-row items-baseline">
          <dt class="w-full text-sm text-pencil sm:w-56">{{ field.label }}</dt>
          <dd class="num min-w-0 flex-1 whitespace-pre-line font-medium">{{ formatValue(field, submission.data[field.key]) }}</dd>
        </div>
      </dl>
    </section>

    <section class="mt-8" aria-labelledby="files-title">
      <h2 id="files-title" class="section-title">{{ t('sub.files') }}</h2>
      <ul class="panel mt-3">
        <li v-for="file in submission.attachments" :key="file.id" class="panel-row">
          <Paperclip :size="16" class="text-pencil" aria-hidden="true" />
          <div class="min-w-[min(100%,10rem)] flex-1"><div class="font-medium">{{ file.name }}</div><div class="num text-xs text-pencil">{{ formatSize(file.size) }} · {{ file.uploader_name }} · {{ formatTime(file.created_at) }}</div></div>
          <button class="btn-quiet" @click="save(file)"><Download :size="16" aria-hidden="true" /> {{ t('sub.download') }}</button>
        </li>
        <li v-if="!submission.attachments.length" class="panel-row text-pencil">{{ t('sub.noFiles') }}</li>
      </ul>
      <label v-if="canAttach()" class="btn-quiet mt-3 cursor-pointer"><Paperclip :size="16" aria-hidden="true" /> {{ t('sub.addFile') }}<input type="file" multiple class="sr-only" @change="attach" /></label>
    </section>

    <section class="mt-8" aria-labelledby="flow-title">
      <h2 id="flow-title" class="section-title">{{ t('flow.label') }}</h2>
      <div class="mt-3"><ProcessFlow :spec="submission.version.spec" :submission="submission" /></div>
    </section>

    <section class="mt-8" aria-labelledby="sign-title">
      <h2 id="sign-title" class="section-title">{{ t('sub.sign') }}</h2>
      <div class="mt-3"><SignatureRow :spec="submission.version.spec" :submission="submission" /></div>
      <p class="hint">{{ t('sub.version', { v: submission.app_version }) }}</p>
    </section>

    <section v-if="sigs?.length" class="mt-8" aria-labelledby="pki-title">
      <h2 id="pki-title" class="section-title">{{ t('sub.pki') }}</h2>
      <ul class="panel mt-3">
        <li v-for="e in sigs" :key="e.event" class="panel-row items-baseline">
          <span class="min-w-0 flex-1">{{ e.actor }} · <span class="num text-sm text-pencil">{{ e.fingerprint?.slice(0, 16) }}…</span></span>
          <span :class="e.valid ? 'text-pen' : 'text-red-700'">{{ e.valid ? t('sub.pki.ok') : t('sub.pki.bad') }}</span>
        </li>
      </ul>
      <p class="hint">{{ t('sub.pki.hint') }}</p>
    </section>

    <section class="mt-8" aria-labelledby="log-title">
      <h2 id="log-title" class="section-title">{{ t('sub.log') }}</h2>
      <ol class="panel mt-3">
        <li class="panel-row items-baseline">
          <time class="num w-32 shrink-0 text-sm text-pencil">{{ formatTime(submission.created_at) }}</time>
          <span>{{ t('sub.sentLog', { who: submission.submitter_name }) }}</span>
        </li>
        <li v-for="e in submission.events" :key="e.created_at + e.step_key" class="panel-row items-baseline">
          <time class="num w-32 shrink-0 text-sm text-pencil">{{ formatTime(e.created_at) }}</time>
          <span class="min-w-0 flex-1">
            {{ t('sub.logLine', { who: e.actor_name, verb: t('sub.verb.' + e.action), step: stepName(e.step_key) }) }}
            <template v-if="e.note">{{ t('sub.note', { note: e.note }) }}</template>
          </span>
        </li>
        <li v-if="submission.status === 'running' && submission.waiting_role" class="panel-row items-baseline text-pencil">
          <span class="w-32 shrink-0 text-sm">{{ t('sub.next') }}</span>
          <span>{{ t('sub.nextLine', { role: ROLE_LABEL[submission.waiting_role], action: t(stepOf(submission)?.type === 'task' ? 'act.do' : 'act.approve'), step: stepOf(submission)?.name }) }}</span>
        </li>
      </ol>
    </section>
  </template>
</template>
