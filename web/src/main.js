// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0

import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import '@fontsource/be-vietnam-pro/400.css'
import '@fontsource/be-vietnam-pro/500.css'
import '@fontsource/be-vietnam-pro/600.css'
import '@fontsource/noto-serif/400.css'
import '@fontsource/noto-serif/700.css'
import './style.css'
import App from './App.vue'
import { login, startLiveUpdates } from './lib.js'
import Home from './pages/Home.vue'
import Apps from './pages/Apps.vue'
import Submission from './pages/Submission.vue'
import Documents from './pages/Documents.vue'
import Stats from './pages/Stats.vue'
import SensorMap from './pages/Map.vue'
import Assistant from './pages/Assistant.vue'
import Builder from './pages/Builder.vue'
import Processes from './pages/Processes.vue'
import Board from './pages/Board.vue'
import Calendar from './pages/Calendar.vue'
import Profile from './pages/Profile.vue'
import Ask from './pages/Ask.vue'

// Đăng nhập trước khi dựng giao diện: mọi màn hình đều cần token.
// Router tạo sau khi đăng nhập, để nó không giữ lại mã xác thực mà Keycloak vừa gỡ khỏi thanh địa chỉ.
login().then(() => {
  startLiveUpdates()
  const router = createRouter({
    history: createWebHistory(),
    routes: [
      { path: '/', component: Home },
      { path: '/gui/:key?', component: Apps },
      { path: '/ho-so/:id', component: Submission },
      { path: '/tai-lieu', component: Documents },
      { path: '/so-lieu', component: Stats },
      { path: '/ban-do', component: SensorMap },
      { path: '/tro-ly', component: Assistant },
      { path: '/soan', component: Builder },
      { path: '/quy-trinh', component: Processes },
      { path: '/bang', component: Board },
      { path: '/lich', component: Calendar },
      { path: '/ca-nhan', component: Profile },
      { path: '/hoi-dap', component: Ask },
      { path: '/:rest(.*)', redirect: '/' },
    ],
  })
  createApp(App).use(router).mount('#app')
})
