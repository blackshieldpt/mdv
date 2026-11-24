// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '@playwright/test'
import { spawn } from 'child_process'
import { mkdirSync, writeFileSync } from 'fs'
import { basename, join } from 'path'
import { start, stop, type Session } from './harness'

const title = (s: Session) => s.page.locator('.tree .pane-title')
const file = (s: Session, name: string) => s.page.locator('.tree .file', { hasText: name })

/** Opens `folder` through a second launch, which also grants it, and waits for the tree to show it. */
async function launch(s: Session, folder: string): Promise<void> {
  const second = spawn(require('electron') as unknown as string, [...s.launchArgs, folder])
  expect(await new Promise((resolve) => second.once('exit', resolve))).toBe(0)
  await expect(title(s)).toHaveText(new RegExp(`^${basename(folder)}$`, 'i'))
}

/** A folder whose whole tree takes long to read: 1,000 folders of 20 documents. */
function deepFolder(path: string): void {
  for (let d = 0; d < 1000; d++) {
    mkdirSync(join(path, 'deep', `d${d}`), { recursive: true })
    for (let f = 0; f < 20; f++) writeFileSync(join(path, 'deep', `d${d}`, `f${f}.md`), '# x\n')
  }
}

test.describe('two folders opened back to back (#25)', () => {
  let s: Session
  let big: string
  let small: string

  test.beforeEach(async () => {
    s = await start()
    big = join(s.docs, '..', 'big')
    small = join(s.docs, '..', 'small')
    deepFolder(big)
    mkdirSync(small)
    writeFileSync(join(small, 'one.md'), '# one\n')
    for (const folder of [big, small, s.docs]) await launch(s, folder)
    // The tree shows a folder before main has swapped the watchers; a reported file proves it has.
    writeFileSync(join(s.docs, 'watched.md'), '# watched\n')
    await expect(file(s, 'watched.md')).toBeVisible()
    await s.page.evaluate('window.changes = 0; window.mdv.onTreeChanged(() => window.changes++)')
  })
  test.afterEach(async () => {
    expect(s.errors).toEqual([])
    await stop(s)
  })

  /** Sends the two `open` messages two folders opened together produce, back to back. */
  const openBoth = (first: string, second: string): Promise<void> =>
    s.app.evaluate(
      ({ BrowserWindow }, [a, b]) => {
        const contents = BrowserWindow.getAllWindows()[0].webContents
        contents.send('open', { root: a })
        contents.send('open', { root: b })
      },
      [first, second]
    )

  /** Waits until both tree reads are surely done, then resets the tree-changed count. */
  async function settle(): Promise<void> {
    await s.page.waitForTimeout(3000)
    await s.page.evaluate('window.changes = 0')
  }

  test('claim 1: when the first folder\'s read finishes last, a file added to the folder shown appears', async () => {
    await openBoth(big, small)
    await expect(title(s)).toHaveText(/^small$/i)
    await expect(file(s, 'one.md')).toBeVisible()
    await settle()
    writeFileSync(join(small, 'two.md'), '# two\n')
    await expect(file(s, 'two.md')).toBeVisible()
  })

  test('claim 2: after that, a change in the first folder sends no tree-changed', async () => {
    await openBoth(big, small)
    await expect(file(s, 'one.md')).toBeVisible()
    await settle()
    writeFileSync(join(big, 'top.md'), '# top\n')
    await s.page.waitForTimeout(1500)
    expect(await s.page.evaluate('window.changes')).toBe(0)
  })

  test('guard: when the second folder\'s read finishes last, that folder is shown and followed', async () => {
    await openBoth(small, big)
    await expect(title(s)).toHaveText(/^big$/i)
    await settle()
    writeFileSync(join(big, 'top.md'), '# top\n')
    await expect(file(s, 'top.md')).toBeVisible()
  })
})
