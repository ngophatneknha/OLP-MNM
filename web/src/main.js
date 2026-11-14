// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0

import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import './style.css'
import App from './App.vue'
import { login } from './lib.js'
import Inbox from './pages/Inbox.vue'
import Apps from './pages/Apps.vue'
import Builder from './pages/Builder.vue'

// Đăng nhập trước khi dựng giao diện: mọi màn hình đều cần token.
// Router tạo sau khi đăng nhập, để nó không giữ lại mã xác thực mà Keycloak vừa gỡ khỏi thanh địa chỉ.
login().then(() => {
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: Inbox },
      { path: '/apps', component: Apps },
      { path: '/builder', component: Builder },
      { path: '/:rest(.*)', redirect: '/' },
    ],
  })
  createApp(App).use(router).mount('#app')
})
