// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { start, stop, type Session } from './harness'

const file = (s: Session, name: string) => s.page.locator('.tree .file', { hasText: name })
const refresh = (s: Session) => s.page.getByRole('button', { name: 'Refresh file tree' })

test.describe('refreshing the file tree (#19)', () => {
  let s: Session

  test.beforeEach(async () => {
    // The fixture README shows an image, which would fail to load once its folder is gone.
    s = await start((docs) => writeFileSync(join(docs, 'README.md'), '# Plain\n'))
    await expect(file(s, 'README.md')).toBeVisible()
  })
  test.afterEach(async () => {
    expect(s.errors).toEqual([])
    await stop(s)
  })

  /** Removes the opened folder, waits until the watch has gone quiet, then creates it again with `files`. */
  async function replaceFolder(files: string[]): Promise<void> {
    rmSync(s.docs, { recursive: true })
    await expect(s.page.locator('.tree .file')).toHaveCount(0)
    await s.page.waitForTimeout(1000)
    for (const name of files) {
      mkdirSync(join(s.docs, name, '..'), { recursive: true })
      writeFileSync(join(s.docs, name), `# ${name}\n`)
    }
  }

  test('claim 1: after the opened folder is removed and created again, Refresh lists what it now holds', async () => {
    await replaceFolder(['unzipped.md', 'sub/later.md'])
    await refresh(s).click()
    await expect(file(s, 'unzipped.md')).toBeVisible()
    await expect(s.page.locator('.tree .dir', { hasText: 'sub' })).toBeVisible()
  })
})
