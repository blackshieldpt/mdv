// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: 'e2e',
  workers: 1,
  reporter: 'list'
})
