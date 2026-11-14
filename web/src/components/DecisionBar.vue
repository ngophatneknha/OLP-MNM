<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Các nút hành động trên một hồ sơ đang chờ tôi. Từ chối mở hộp thoại bắt buộc ghi lý do:
đây là quyết định cần dừng lại suy nghĩ, và người gửi cần biết phải sửa gì.
-->
<script setup>
import { ref } from 'vue'
import { Check, X } from 'lucide-vue-next'
import { sendAction, stepOf, toast } from '../lib.js'

const props = defineProps({ submission: { type: Object, required: true } })
const emit = defineEmits(['done'])

const busy = ref(false)
const dialog = ref(null)
const reason = ref('')

async function act(action, note) {
  busy.value = true
  try {
    await sendAction(props.submission, action, note)
    emit('done')
  } catch (err) {
    toast(`Chưa ghi nhận được: ${err.message}. Hãy thử lại.`, false)
  } finally {
    busy.value = false
  }
}

async function refuse() {
  await act('reject', reason.value)
  dialog.value.close()
  reason.value = ''
}
</script>

<template>
  <div class="flex flex-wrap gap-2">
    <button v-if="stepOf(submission)?.type === 'task'" class="btn-primary" :disabled="busy" @click="act('done')">
      <Check :size="16" aria-hidden="true" /> Đã thực hiện xong
    </button>
    <template v-else>
      <button class="btn-primary" :disabled="busy" @click="act('approve')"><Check :size="16" aria-hidden="true" /> Duyệt</button>
      <button class="btn-danger" :disabled="busy" @click="dialog.showModal()"><X :size="16" aria-hidden="true" /> Từ chối</button>
    </template>

    <dialog ref="dialog" class="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-lg border border-line bg-surface p-0 text-ink">
      <form class="p-5" @submit.prevent="refuse">
        <h2 class="section-title">Từ chối hồ sơ số {{ submission.no }}</h2>
        <label class="label mt-4" for="reason">Lý do từ chối</label>
        <textarea id="reason" v-model="reason" class="input" rows="3" required minlength="5" placeholder="Ví dụ: Thiếu báo giá của nhà cung cấp" />
        <p class="hint">{{ submission.submitter_name }} sẽ đọc được lý do này.</p>
        <div class="mt-5 flex justify-end gap-2">
          <button type="button" class="btn-quiet" @click="dialog.close()">Quay lại</button>
          <button class="btn-danger" :disabled="busy || reason.trim().length < 5">Từ chối hồ sơ</button>
        </div>
      </form>
    </dialog>
  </div>
</template>
