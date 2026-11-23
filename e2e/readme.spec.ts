// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { start, stop } from './harness'

/** Replaces the fixture's README.md with the given entries: a file for text, a folder for null. */
const folder =
  (entries: Record<string, string | null>) =>
  (docs: string): void => {
    rmSync(join(docs, 'README.md'))
    for (const [name, text] of Object.entries(entries)) {
      if (text === null) mkdirSync(join(docs, name))
      else writeFileSync(join(docs, name), text)
    }
  }

const cases: [string, (docs: string) => void, string][] = [
  [
    '#9 claim 1: README.md is chosen over README.markdown',
    folder({ 'README.md': '# md\n', 'README.markdown': '# markdown\n' }),
    'README.md'
  ],
  [
    '#9 claim 2: a folder named README.markdown is passed over for README.md',
    folder({ 'README.markdown': null, 'README.md': '# md\n' }),
    'README.md'
  ],
  [
    '#9 claim 3: a folder named README.md is passed over for README.mkd',
    folder({ 'README.md': null, 'README.mkd': '# mkd\n' }),
    'README.mkd'
  ],
  [
    '#9 claim 4: readme.md is chosen over README.mkd',
    folder({ 'readme.md': '# md\n', 'README.mkd': '# mkd\n' }),
    'readme.md'
  ],
  [
    '#9 claim 5: the extension is ranked whatever its case, so README.markdown beats README.MKD',
    folder({ 'README.MKD': '# mkd\n', 'README.markdown': '# markdown\n' }),
    'README.markdown'
  ],
  [
    '#9 guard: a folder named README.md is passed over for README.markdown',
    folder({ 'README.md': null, 'README.markdown': '# markdown\n' }),
    'README.markdown'
  ],
  [
    '#9 guard: between names that differ only in case, the first in code-point order wins',
    folder({ 'readme.md': '# lower\n', 'README.md': '# upper\n' }),
    'README.md'
  ]
]

for (const [name, prepare, opened] of cases) {
  test(name, async () => {
    const s = await start(prepare)
    try {
      await expect(s.page).toHaveTitle(`${opened} — mdv`)
      await expect(s.page.locator('.tree .file.active')).toHaveText(opened)
      expect(s.errors).toEqual([])
    } finally {
      await stop(s)
    }
  })
}
