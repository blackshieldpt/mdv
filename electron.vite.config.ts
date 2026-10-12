// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { licenses } from './scripts/licenses'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react(), licenses()],
    build: {
      rollupOptions: {
        input: { index: resolve('src/renderer/index.html'), print: resolve('src/renderer/print.html') }
      }
    }
  }
})
