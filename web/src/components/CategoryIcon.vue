<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0
-->
<script setup>
import { Banknote, CalendarDays, ShoppingCart, Stamp, FileText } from 'lucide-vue-next'

defineProps({ category: { type: String, default: '' } })
const ICONS = { 'Tài chính': Banknote, 'Nhân sự': CalendarDays, 'Mua sắm': ShoppingCart, 'Hành chính': Stamp }
</script>

<template>
  <span class="tile-icon"><component :is="ICONS[category] ?? FileText" :size="20" aria-hidden="true" /></span>
</template>
