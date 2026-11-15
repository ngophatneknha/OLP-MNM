<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Hàng ô ký: cách mọi tờ đề nghị trong văn phòng Việt Nam cho biết ai đã ký và còn chờ ai.
Mỗi bước của quy trình là một ô; đã duyệt thì có dấu đỏ kèm tên và giờ, đang chờ thì ô sáng lên,
bước không áp dụng cho hồ sơ này thì ghi rõ. Không truyền `submission` thì đây là bản xem trước của quy trình.
-->
<script setup>
import { computed } from 'vue'
import { Clock, MinusCircle } from 'lucide-vue-next'
import { stepStates } from '../flow.js'
import { ROLE_LABEL, conditionText, formatTime } from '../lib.js'

const props = defineProps({
  spec: { type: Object, required: true },
  submission: { type: Object, default: null },
})

const boxes = computed(() => stepStates(props.spec, props.submission).map((box) => ({
  ...box,
  condition: conditionText(props.spec, box),
  // Dấu vừa đóng trong vài giây gần đây thì có hiệu ứng "ấn dấu": phản hồi cho hành động người dùng vừa làm.
  fresh: box.event && Date.now() - Date.parse(box.event.created_at) < 8000,
})))
</script>

<template>
  <ol class="grid grid-cols-2 overflow-hidden rounded-md border-l border-t border-line sm:grid-cols-[repeat(auto-fill,minmax(10rem,1fr))]">
    <li v-if="submission" class="flex min-h-32 flex-col border-b border-r border-line bg-surface p-3">
      <div class="text-sm font-medium">Người đề nghị</div>
      <div class="mt-auto pt-3">
        <div class="font-serif text-sm italic text-pen">{{ submission.submitter_name }}</div>
        <div class="num text-xs text-pencil">{{ formatTime(submission.created_at) }}</div>
      </div>
    </li>

    <li
      v-for="box in boxes" :key="box.key"
      class="flex min-h-32 flex-col border-b border-r border-line p-3"
      :class="box.state === 'waiting' ? 'bg-pen-wash' : box.state === 'skipped' ? 'bg-ground' : 'bg-surface'"
    >
      <div class="text-sm font-medium" :class="{ 'text-pencil': box.state === 'skipped' }">{{ box.name }}</div>
      <div class="text-xs text-pencil">{{ ROLE_LABEL[box.role] ?? box.role }}</div>

      <div class="mt-auto pt-3">
        <template v-if="box.state === 'signed' || box.state === 'refused'">
          <div class="pb-2 pl-1">
            <span class="stamp" :class="{ 'stamp-refused': box.state === 'refused', 'stamp-fresh': box.fresh }">
              {{ box.state === 'refused' ? 'KHÔNG DUYỆT' : box.type === 'task' ? 'ĐÃ XONG' : 'ĐÃ DUYỆT' }}
            </span>
          </div>
          <div class="font-serif text-sm italic text-pen">{{ box.event.actor_name }}</div>
          <div class="num text-xs text-pencil">{{ formatTime(box.event.created_at) }}</div>
        </template>

        <div v-else-if="box.state === 'waiting'" class="flex items-center gap-1.5 text-sm font-medium text-pen">
          <Clock :size="16" aria-hidden="true" /> Đang chờ {{ box.type === 'task' ? 'thực hiện' : 'ký' }}
        </div>

        <div v-else-if="box.state === 'skipped'" class="flex items-start gap-1.5 text-xs text-pencil">
          <MinusCircle :size="14" class="mt-0.5 shrink-0" aria-hidden="true" /> Không cần với hồ sơ này
        </div>

        <div v-else class="text-xs text-pencil">
          <template v-if="box.condition">{{ box.condition }}</template>
          <template v-else-if="box.state === 'upcoming'">Chưa tới lượt</template>
          <template v-else>{{ box.type === 'task' ? 'Thực hiện rồi xác nhận' : 'Duyệt hoặc từ chối' }}</template>
        </div>
      </div>
    </li>
  </ol>
</template>
