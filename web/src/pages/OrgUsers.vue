<!--
SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
SPDX-License-Identifier: Apache-2.0

Quản trị người dùng của tổ chức (chỉ giám đốc): xem, thêm, khóa và mở lại tài khoản trong chính tổ chức của mình.
-->
<script setup>
import { onMounted, reactive, ref } from 'vue'
import { auth, getJson, postJson, toast, ROLE_LABEL } from '../lib.js'
import { t } from '../i18n.js'

const users = ref(null)
const form = reactive({ username: '', name: '', role: 'staff', password: '' })
const busy = ref(false)
const ROLES = ['staff', 'manager', 'accountant', 'director']

async function load() {
  try { users.value = await getJson('/orgs/users') } catch (err) { users.value = []; toast(err.message, false) }
}
onMounted(load)

async function add() {
  busy.value = true
  try {
    await postJson('/orgs/users', { ...form })
    toast(t('org.added', { name: form.username }))
    Object.assign(form, { username: '', name: '', role: 'staff', password: '' })
    await load()
  } catch (err) { toast(err.message, false) } finally { busy.value = false }
}
async function toggle(u) {
  try { await postJson(`/orgs/users/${u.id}/${u.enabled ? 'disable' : 'enable'}`, {}); await load() } catch (err) { toast(err.message, false) }
}
</script>

<template>
  <h1 class="font-serif text-2xl font-bold">{{ t('org.title') }}</h1>
  <p class="hint">{{ t('org.hint', { org: auth.orgName }) }}</p>

  <form class="panel mt-4 grid max-w-3xl gap-3 p-4 sm:grid-cols-2" @submit.prevent="add">
    <label class="block text-sm">{{ t('org.username') }}<input v-model="form.username" required class="input mt-1" autocomplete="off" /></label>
    <label class="block text-sm">{{ t('org.name') }}<input v-model="form.name" required class="input mt-1" /></label>
    <label class="block text-sm">{{ t('org.role') }}
      <select v-model="form.role" class="input mt-1"><option v-for="r in ROLES" :key="r" :value="r">{{ ROLE_LABEL[r] }}</option></select>
    </label>
    <label class="block text-sm">{{ t('org.password') }}<input v-model="form.password" type="password" minlength="8" required class="input mt-1" autocomplete="new-password" /></label>
    <div class="sm:col-span-2"><button class="btn-primary" :disabled="busy">{{ t('org.add') }}</button> <span class="hint">{{ t('org.tempHint') }}</span></div>
  </form>

  <p v-if="users === null" class="mt-6 text-pencil">{{ t('common.loading') }}</p>
  <ul v-else class="panel mt-6 max-w-3xl">
    <li v-for="u in users" :key="u.id" class="panel-row items-baseline">
      <span class="min-w-0 flex-1">{{ u.name }} <span class="num text-sm text-pencil">{{ u.username }}</span></span>
      <span class="text-sm text-pencil">{{ ROLE_LABEL[u.role] }}</span>
      <button class="btn-quiet text-sm" :class="u.enabled ? '' : 'text-red-700'" @click="toggle(u)">{{ u.enabled ? t('org.disable') : t('org.enable') }}</button>
    </li>
  </ul>
</template>
