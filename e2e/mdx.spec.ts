// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '@playwright/test'
import { rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { heading, start, stop, tabs, type Session } from './harness'

test.describe('a folder with README.mdx', () => {
  let s: Session

  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    s = await start((docs) => {
      rmSync(join(docs, 'README.md'))
      writeFileSync(
        join(docs, 'README.mdx'),
        "import { Chart } from './chart'\n\n# Start page\n"
      )
    })
  })
  test.afterAll(() => stop(s))

  test('#4 claim 2: opens with README.mdx as its start page', async () => {
    await expect(heading(s, 'Start page')).toBeVisible()
    await expect(s.page).toHaveTitle('README.mdx — mdv')
    await expect(s.page.locator('.tree .file.active')).toHaveText('README.mdx')
  })

  test('#4 claim 5: the app hides the import statement of an .mdx file', async () => {
    await expect(s.page.locator('.markdown')).not.toContainText('import')
  })

  test('logs no errors', () => {
    expect(s.errors).toEqual([])
  })
})

test.describe('a link to an .mdx file', () => {
  let s: Session

  test.describe.configure({ mode: 'serial' })
  test.beforeAll(async () => {
    s = await start((docs) => {
      writeFileSync(join(docs, 'links.md'), '# Links\n\nSee [the page](page.mdx).\n')
      writeFileSync(join(docs, 'page.mdx'), '# Linked page\n')
    }, 'links.md')
  })
  test.afterAll(() => stop(s))

  test('#4 claim 3: opens the .mdx file', async () => {
    await expect(heading(s, 'Links')).toBeVisible()
    await s.page.locator('.markdown a', { hasText: 'the page' }).click()
    await expect(heading(s, 'Linked page')).toBeVisible()
    await expect(tabs(s)).toHaveText(['page.mdx'])
  })

  test('logs no errors', () => {
    expect(s.errors).toEqual([])
  })
})
