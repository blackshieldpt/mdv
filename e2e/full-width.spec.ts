// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { _electron as electron, expect, test } from '@playwright/test'
import { writeFileSync } from 'fs'
import { join } from 'path'
import { clickMenu, openFromTree, start, stop, type Session } from './harness'

/** The width the document column is capped at by default. */
const CAP = 880

/** The type and state of the View menu's Full Width item, or null when there is none. */
const fullWidthItem = ({ app }: Session) =>
  app.evaluate(({ Menu }) => {
    const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => {
      for (const item of items) {
        const found = item.label === 'Full Width' ? item : item.submenu && find(item.submenu.items)
        if (found) return found
      }
    }
    const item = find(Menu.getApplicationMenu()!.items)
    return item ? { type: item.type, checked: item.checked } : null
  })

/** The widths of the shown document's column and of the area it sits in. */
const widths = async ({ page }: Session): Promise<{ column: number; area: number }> => ({
  column: await page.locator('article.markdown').evaluate((el) => el.getBoundingClientRect().width),
  area: await page.locator('.doc-scroller').evaluate((el) => el.clientWidth)
})

/** How far the column's width is from the document area's, once layout has settled. */
const gap = async (s: Session): Promise<number> => {
  const { column, area } = await widths(s)
  return Math.abs(column - area)
}

/** Widens the window so the document area is clearly wider than the cap, with both side panes open. */
async function widen(s: Session): Promise<void> {
  // Asked again on each try: under xvfb the window manager sometimes drops the first resize.
  await expect
    .poll(async () => {
      await s.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setSize(1800, 900))
      return (await widths(s)).area
    })
    .toBeGreaterThan(CAP + 200)
}

test.describe('full width (#14)', () => {
  let s: Session

  test.beforeEach(async () => {
    s = await start((docs) => writeFileSync(join(docs, 'other.md'), '# Other\n'))
    await expect(s.page.locator('.markdown h1').first()).toBeVisible()
    await widen(s)
  })
  test.afterEach(async () => {
    expect(s.errors).toEqual([])
    await stop(s)
  })

  test('claim 1: by default the document column is at most 880px wide', async () => {
    expect((await widths(s)).column).toBeLessThanOrEqual(CAP)
  })

  test('claim 2: the View menu has a Full Width checkbox, unchecked by default', async () => {
    expect(await fullWidthItem(s)).toEqual({ type: 'checkbox', checked: false })
  })

  test('claim 3: with Full Width checked the column spans the document area, padding kept', async () => {
    await clickMenu(s, 'Full Width')
    await expect.poll(async () => (await widths(s)).column).toBeGreaterThan(CAP + 200)
    await expect.poll(() => gap(s)).toBeLessThanOrEqual(1)
    await expect(s.page.locator('article.markdown')).toHaveCSS('padding-left', '48px')
    expect(await fullWidthItem(s)).toEqual({ type: 'checkbox', checked: true })
  })

  test('claim 4: unchecking Full Width restores the 880px column', async () => {
    await clickMenu(s, 'Full Width')
    await expect.poll(async () => (await widths(s)).column).toBeGreaterThan(CAP + 200)
    await clickMenu(s, 'Full Width')
    await expect.poll(async () => (await widths(s)).column).toBeLessThanOrEqual(CAP)
    expect(await fullWidthItem(s)).toEqual({ type: 'checkbox', checked: false })
  })

  test('claim 5: the choice applies to another tab', async () => {
    await clickMenu(s, 'Full Width')
    await expect.poll(async () => (await widths(s)).column).toBeGreaterThan(CAP + 200)
    await openFromTree(s, 'other.md', 'Other')
    await expect.poll(() => gap(s)).toBeLessThanOrEqual(1)
  })
})

test('#14 claim 6: Full Width survives a restart', async () => {
  const s = await start()
  try {
    await expect(s.page.locator('.markdown h1').first()).toBeVisible()
    await widen(s)
    await clickMenu(s, 'Full Width')
    await expect.poll(async () => (await widths(s)).column).toBeGreaterThan(CAP + 200)
    await s.app.close()

    s.app = await electron.launch({ args: [...s.launchArgs, s.docs], chromiumSandbox: true })
    s.page = await s.app.firstWindow()
    s.page.on('console', (message) => message.type() === 'error' && s.errors.push(message.text()))
    s.page.on('pageerror', (error) => s.errors.push(error.message))
    await expect(s.page.locator('.markdown h1').first()).toBeVisible()
    await widen(s)
    await expect.poll(() => fullWidthItem(s)).toEqual({ type: 'checkbox', checked: true })
    await expect.poll(() => gap(s)).toBeLessThanOrEqual(1)
    expect(s.errors).toEqual([])
  } finally {
    await stop(s)
  }
})
