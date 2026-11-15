<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Hỏi đáp tài liệu [I]: trợ lý chỉ trả lời từ hồ sơ và tệp mà người hỏi được xem, mỗi ý dẫn nguồn để bấm vào kiểm chứng.
Nội dung trích dẫn dựng bằng văn bản thuần (không v-html) vì tệp do người dùng tải lên.
-->
<script setup>
import { ref } from 'vue'
import { Search, FileText, ClipboardList } from 'lucide-vue-next'
import { postJson } from '../lib.js'
import { snippetParts } from '../snippet.js'
import { t } from '../i18n.js'

const question = ref('')
const busy = ref(false)
const result = ref(null)
const failed = ref('')

async function ask() {
  if (question.value.trim().length < 2) return
  busy.value = true
  failed.value = ''
  try {
    result.value = await postJson('/ask', { question: question.value })
  } catch (err) {
    result.value = null
    failed.value = err.message
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <h1 class="page-title">{{ t('ask.title') }}</h1>
  <p class="page-lead">{{ t('ask.lead') }}</p>

  <form class="mt-6 flex flex-wrap gap-2" @submit.prevent="ask">
    <label class="sr-only" for="q">{{ t('ask.label') }}</label>
    <input id="q" v-model="question" class="input min-w-0 flex-1" :placeholder="t('ask.placeholder')" maxlength="500" autocomplete="off">
    <button class="btn-primary" :disabled="busy || question.trim().length < 2">
      <Search :size="16" aria-hidden="true" /> {{ busy ? t('ask.busy') : t('ask.go') }}
    </button>
  </form>

  <p v-if="failed" class="mt-4 rounded-md bg-seal-wash px-4 py-3 text-sm text-seal" role="alert">{{ failed }}</p>

  <div v-if="result" class="mt-6 space-y-6" aria-live="polite">
    <section v-if="result.answer || result.answerError">
      <h2 class="section-title">{{ t('ask.answer') }}</h2>
      <p v-if="result.answer" class="sticky-note mt-2 whitespace-pre-line">{{ result.answer }}</p>
      <p v-else class="mt-2 text-sm text-pencil">{{ result.answerError }}</p>
    </section>
    <section v-if="result.sources.length">
      <h2 class="section-title">{{ t('ask.sources') }}</h2>
      <ol class="panel mt-2">
        <li v-for="(s, i) in result.sources" :key="s.id" class="panel-row items-start">
          <span class="avatar mt-0.5" aria-hidden="true">{{ i + 1 }}</span>
          <div class="min-w-0 flex-1">
            <RouterLink :to="`/ho-so/${s.submission_id}`" class="inline-flex items-center gap-1.5 font-medium hover:text-pen hover:underline">
              <component :is="s.kind === 'file' ? FileText : ClipboardList" :size="16" aria-hidden="true" />
              {{ s.title }}<template v-if="s.name"> · {{ s.name }}</template>
            </RouterLink>
            <p class="mt-1 whitespace-pre-line break-words text-sm text-pencil">
              <template v-for="(p, j) in snippetParts(s.snippet)" :key="j"><mark v-if="p.hit" class="rounded bg-note px-0.5 text-ink">{{ p.text }}</mark><template v-else>{{ p.text }}</template></template>
            </p>
          </div>
        </li>
      </ol>
    </section>
    <p v-else-if="!result.answer" class="text-pencil">{{ t('ask.none') }}</p>
  </div>
</template>
