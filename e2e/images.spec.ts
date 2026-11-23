// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '@playwright/test'
import { chmodSync, mkdirSync, writeFileSync } from 'fs'
import { join } from 'path'
import { start, stop } from './harness'


const cases: [string, string, (docs: string) => void][] = [
  ['#23 claim 1: a missing image file fails as not found', 'nope.png', () => {}],
  ['#23 a folder named like an image fails as not found', 'shots.png', (docs) => mkdirSync(join(docs, 'shots.png'))],
  [
    '#23 an image file that cannot be read fails as not found',
    'locked.png',
    (docs) => {
      writeFileSync(join(docs, 'locked.png'), 'x')
      chmodSync(join(docs, 'locked.png'), 0o000)
    }
  ]
]

for (const [name, src, prepare] of cases) {
  test(name, async () => {
    const s = await start((docs) => {
      writeFileSync(join(docs, 'README.md'), `# Images\n\n![x](${src})\n`)
      prepare(docs)
    })
    try {
      const image = s.page.locator('.markdown img')
      await expect(image).toHaveJSProperty('complete', true)
      await expect(image).toHaveJSProperty('naturalWidth', 0)
      // The reason phrase after the status is Chromium's, so only the status is matched.
      await expect.poll(() => s.errors).toEqual([expect.stringMatching(/status of 404\b/)])
    } finally {
      await stop(s)
    }
  })
}

test('#23 claim 2 (guard): an image file that exists still loads, with nothing logged', async () => {
  const s = await start((docs) => writeFileSync(join(docs, 'README.md'), '# Images\n\n![x](guide/logo.svg)\n'))
  try {
    await expect(s.page.locator('.markdown img')).toHaveJSProperty('naturalWidth', 120)
    expect(s.errors).toEqual([])
  } finally {
    await stop(s)
  }
})
