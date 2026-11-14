// SPDX-FileCopyrightText: 2026 DX-Lab Project Hub contributors
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({ plugins: [vue(), tailwindcss()] })
