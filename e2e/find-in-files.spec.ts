// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { _electron as electron, expect, test } from '@playwright/test'
import { spawn } from 'child_process'
import { chmodSync, mkdirSync, utimesSync, writeFileSync } from 'fs'
import { join } from 'path'
import { clickMenu, heading, openFromTree, start, stop, type Session } from './harness'

const COMMAND = 'Find in Files…'

/** Adds documents mentioning "zebrafish", and one outside the folder that a document links to. */
function prepare(docs: string): void {
  writeFileSync(join(docs, 'alpha.md'), '# Alpha\n\nA zebrafish, and another zebrafish.\n')
  mkdirSync(join(docs, 'deep/er'), { recursive: true })
  writeFileSync(join(docs, 'deep/er/beta.md'), '# Beta\n\nOne zebrafish down here.\n')
  writeFileSync(join(docs, 'gamma.md'), '# Gamma\n\nNothing to see.\n\n[Outside](../outside.md)\n')
  writeFileSync(join(docs, '..', 'outside.md'), '# Outside\n\nA zebrafish outside the folder.\n')
}

const view = ({ page }: Session) => page.locator('.find-in-files')
const query = ({ page }: Session) => page.locator('.find-in-files input[type="search"]')
const results = ({ page }: Session) => page.locator('.find-in-files .result')
const names = async (s: Session): Promise<string[]> => (await results(s).locator('.result-name').allTextContents()).sort()

async function search(s: Session, text: string, scope: 'Open documents' | 'Folder'): Promise<void> {
  await view(s).getByLabel(scope).check()
  await query(s).fill(text)
  await query(s).press('Enter')
}

test.describe('find in files (#20)', () => {
  let s: Session

  test.beforeEach(async () => {
    s = await start(prepare)
    await expect(heading(s, 'Showcase')).toBeVisible()
  })
  test.afterEach(async () => {
    expect(s.errors).toEqual([])
    await stop(s)
  })

  test('claim 1: the command shows the view in the left pane, query focused, opening a collapsed pane', async () => {
    await clickMenu(s, 'Toggle File Tree')
    await expect(s.page.locator('.tree')).toBeHidden()
    await clickMenu(s, COMMAND)
    await expect(view(s)).toBeVisible()
    await expect(query(s)).toBeFocused()
  })

  test('claim 2: two scopes, Folder chosen when a folder is open', async () => {
    await clickMenu(s, COMMAND)
    await expect(view(s).getByLabel('Open documents')).not.toBeChecked()
    await expect(view(s).getByLabel('Folder')).toBeChecked()
    await expect(view(s).getByLabel('Folder')).toBeEnabled()
  })

  test('claim 3: a search runs on Enter, not while typing', async () => {
    await clickMenu(s, COMMAND)
    await query(s).fill('zebrafish')
    await s.page.waitForTimeout(500)
    await expect(results(s)).toHaveCount(0)
    await query(s).press('Enter')
    await expect(results(s)).toHaveCount(2)
  })

  test('claim 4: Open documents lists every open tab with a match, not only the active one', async () => {
    await openFromTree(s, 'alpha.md', 'Alpha')
    await openFromTree(s, 'gamma.md', 'Gamma')
    await clickMenu(s, COMMAND)
    await search(s, 'zebrafish', 'Open documents')
    await expect(results(s)).toHaveCount(1)
    expect(await names(s)).toEqual(['alpha.md'])
    await expect(results(s).locator('.result-count')).toHaveText('2')
  })

  test('claim 6: Folder lists the files of the tree at any depth, and no file outside it', async () => {
    await openFromTree(s, 'gamma.md', 'Gamma')
    // Following the link lets the main process serve outside.md, which the tree does not list.
    await s.page.locator('.markdown a', { hasText: 'Outside' }).click()
    await expect(heading(s, 'Outside')).toBeVisible()
    await clickMenu(s, COMMAND)
    await search(s, 'zebrafish', 'Folder')
    await expect(results(s)).toHaveCount(2)
    expect(await names(s)).toEqual(['alpha.md', 'beta.md'])
    await expect(results(s).filter({ hasText: 'beta.md' }).locator('.result-path')).toHaveText(/^deep[\\/]er[\\/]beta\.md$/)
  })

  test('claim 8: a result shows its snippet, and clicking it opens the file with the find bar on the query', async () => {
    await clickMenu(s, COMMAND)
    await search(s, 'zebrafish', 'Folder')
    const beta = results(s).filter({ hasText: 'beta.md' })
    await expect(beta.locator('.result-snippet')).toHaveText('One zebrafish down here.')
    await beta.click()
    await expect(heading(s, 'Beta')).toBeVisible()
    await expect(s.page.locator('.tab.active span')).toHaveText('beta.md')
    await expect(s.page.locator('.find input')).toHaveValue('zebrafish')
    await expect(s.page.locator('.find-count')).toHaveText('1 / 1')
  })

  test('claim 8: clicking a result for an open file switches to its tab', async () => {
    await openFromTree(s, 'alpha.md', 'Alpha')
    await openFromTree(s, 'gamma.md', 'Gamma')
    const count = await s.page.locator('.tab').count()
    await clickMenu(s, COMMAND)
    await search(s, 'zebrafish', 'Folder')
    await results(s).filter({ hasText: 'alpha.md' }).click()
    await expect(s.page.locator('.tab.active span')).toHaveText('alpha.md')
    await expect(s.page.locator('.tab')).toHaveCount(count)
  })

  test('claim 1: the command is on Ctrl/Cmd+Shift+F', async () => {
    const accelerator = await s.app.evaluate(({ Menu }) => {
      const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => {
        for (const item of items) {
          const found = item.label === 'Find in Files…' ? item : item.submenu && find(item.submenu.items)
          if (found) return found
        }
      }
      return find(Menu.getApplicationMenu()!.items)?.accelerator
    })
    expect(accelerator).toBe('CmdOrCtrl+Shift+F')
  })

  test('claim 4: the active tab is searched too, and a tab whose read failed is not listed', async () => {
    await s.page.locator('.tree .dir', { hasText: 'deep' }).click()
    await s.page.locator('.tree .dir', { hasText: 'er' }).click()
    await openFromTree(s, 'beta.md', 'Beta')
    await openFromTree(s, 'gamma.md', 'Gamma')
    // The active tab, and the only readable one with a match.
    await openFromTree(s, 'alpha.md', 'Alpha')
    const beta = join(s.docs, 'deep/er/beta.md')
    chmodSync(beta, 0o000)
    try {
      utimesSync(beta, new Date(), new Date())
      await s.page.waitForTimeout(1000)
      await clickMenu(s, COMMAND)
      await search(s, 'zebrafish', 'Open documents')
      await expect(view(s).locator('.find-status')).toHaveText('')
      expect(await names(s)).toEqual(['alpha.md'])
    } finally {
      chmodSync(beta, 0o644)
    }
  })

  test('claim 6: an .mdx file is searched as MDX, its import and export lines hidden', async () => {
    writeFileSync(join(s.docs, 'delta.mdx'), "export const note = 'zebrafish'\n\n# Delta\n\nOne zebrafish.\n")
    await expect(s.page.locator('.tree .file', { hasText: 'delta.mdx' })).toBeVisible()
    await clickMenu(s, COMMAND)
    await search(s, 'zebrafish', 'Folder')
    await expect(results(s).filter({ hasText: 'delta.mdx' }).locator('.result-count')).toHaveText('1')
  })

  test('claim 7: a file with more than 10,000 matches shows 10000+', async () => {
    writeFileSync(join(s.docs, 'many.md'), 'qq '.repeat(10001) + '\n')
    await expect(s.page.locator('.tree .file', { hasText: 'many.md' })).toBeVisible()
    await clickMenu(s, COMMAND)
    await search(s, 'qq', 'Folder')
    await expect(results(s).filter({ hasText: 'many.md' }).locator('.result-count')).toHaveText('10000+')
  })

  test('claim 8: a result for the document already shown opens the find bar on the query', async () => {
    await openFromTree(s, 'alpha.md', 'Alpha')
    await clickMenu(s, COMMAND)
    await search(s, 'zebrafish', 'Folder')
    await results(s).filter({ hasText: 'alpha.md' }).click()
    await expect(s.page.locator('.find input')).toHaveValue('zebrafish')
    await expect(s.page.locator('.find-count')).toHaveText('1 / 2')
    // The seeded query is selected, so typing replaces it.
    await s.page.keyboard.type('another')
    await expect(s.page.locator('.find input')).toHaveValue('another')
  })

  test('claim 8: after the find bar is closed, Find opens it empty again, not on the old query', async () => {
    await clickMenu(s, COMMAND)
    await search(s, 'zebrafish', 'Folder')
    await results(s).filter({ hasText: 'alpha.md' }).click()
    await expect(s.page.locator('.find input')).toHaveValue('zebrafish')
    await s.page.locator('.find input').press('Escape')
    await expect(s.page.locator('.find')).toHaveCount(0)
    await clickMenu(s, 'Find…')
    await expect(s.page.locator('.find input')).toHaveValue('')
  })

  test('switching scope clears the results of the other scope', async () => {
    await clickMenu(s, COMMAND)
    await search(s, 'zebrafish', 'Folder')
    await expect(results(s)).toHaveCount(2)
    await view(s).getByLabel('Open documents').check()
    await expect(results(s)).toHaveCount(0)
  })

  test('claim 9: Esc in the query box, or the command again, shows the file tree again', async () => {
    await clickMenu(s, COMMAND)
    await expect(s.page.locator('.tree')).toBeHidden()
    await query(s).press('Escape')
    await expect(view(s)).toBeHidden()
    await expect(s.page.locator('.tree')).toBeVisible()
    await clickMenu(s, COMMAND)
    await expect(view(s)).toBeVisible()
    await clickMenu(s, COMMAND)
    await expect(view(s)).toBeHidden()
    await expect(s.page.locator('.tree')).toBeVisible()
  })
})

test('#20 claim 2: a single file opened shows its folder, and Folder is the default', async () => {
  const s = await start(prepare, 'alpha.md')
  try {
    await expect(heading(s, 'Alpha')).toBeVisible()
    await clickMenu(s, COMMAND)
    await expect(view(s).getByLabel('Folder')).toBeChecked()
    expect(s.errors).toEqual([])
  } finally {
    await stop(s)
  }
})

test('#20 claim 6: a document beside the folder whose name starts with the folder name gets no folder path', async () => {
  const s = await start((docs) => {
    prepare(docs)
    mkdirSync(join(docs, '..', 'docs-old'))
    writeFileSync(join(docs, '..', 'docs-old/old.md'), '# Old\n\nAn old zebrafish.\n')
    writeFileSync(join(docs, 'gamma.md'), '# Gamma\n\n[Old](../docs-old/old.md)\n')
  })
  try {
    await openFromTree(s, 'gamma.md', 'Gamma')
    await s.page.locator('.markdown a', { hasText: 'Old' }).click()
    await expect(heading(s, 'Old')).toBeVisible()
    await clickMenu(s, COMMAND)
    await search(s, 'zebrafish', 'Open documents')
    await expect(results(s)).toHaveCount(1)
    await expect(results(s).locator('.result-path')).toHaveCount(0)
    expect(s.errors).toEqual([])
  } finally {
    await stop(s)
  }
})

test('#20 claim 1 and 2: with nothing open the view opens, and Folder is disabled', async () => {
  const s = await start()
  try {
    await s.app.close()
    s.app = await electron.launch({ args: s.launchArgs, chromiumSandbox: true })
    s.page = await s.app.firstWindow()
    s.page.on('console', (message) => message.type() === 'error' && s.errors.push(message.text()))
    s.page.on('pageerror', (error) => s.errors.push(error.message))
    await expect(s.page.locator('.welcome')).toBeVisible()
    await clickMenu(s, COMMAND)
    await expect(view(s)).toBeVisible()
    await expect(query(s)).toBeFocused()
    await expect(view(s).getByLabel('Folder')).toBeDisabled()
    await expect(view(s).getByLabel('Open documents')).toBeChecked()
    // A folder opened afterwards makes Folder the default (claim 2).
    const second = spawn(require('electron') as unknown as string, [...s.launchArgs, s.docs])
    try {
      expect(await new Promise((resolve) => second.once('exit', resolve))).toBe(0)
    } finally {
      second.kill()
    }
    await expect(view(s).getByLabel('Folder')).toBeChecked()
    expect(s.errors).toEqual([])
  } finally {
    await stop(s)
  }
})
