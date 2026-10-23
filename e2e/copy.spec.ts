// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '@playwright/test'
import { clickMenu, start, stop, type Session } from './harness'

let s: Session

/** Selects from the start of the first element matching `from` to the end of the first matching `to`. */
const select = (from: string, to = from): Promise<string> =>
  s.page.evaluate(`(() => {
    const range = document.createRange()
    range.setStartBefore(document.querySelector(${JSON.stringify(from)}).firstChild)
    const end = document.querySelector(${JSON.stringify(to)})
    range.setEnd(end, end.childNodes.length)
    const selection = getSelection()
    selection.removeAllRanges()
    selection.addRange(range)
    return selection.toString()
  })()`)

/** The labels of every context menu shown so far. */
const popups = (): Promise<string[][]> =>
  s.app.evaluate(() =>
    (globalThis as unknown as { popups: Electron.Menu[] }).popups.map((menu) => menu.items.map((item) => item.label))
  )

/** Returns once the main process has handled every request the window sent before. */
const settled = (): Promise<unknown> => s.page.evaluate('window.mdv.about()')

/** Clicks an item of the last context menu shown, or of the application menu. */
const choose = (label: string, from: 'popup' | 'menu'): Promise<void> =>
  s.app.evaluate(
    ({ BrowserWindow, Menu }, [label, from]) => {
      const menu =
        from === 'popup' ? (globalThis as unknown as { popups: Electron.Menu[] }).popups.at(-1)! : Menu.getApplicationMenu()!
      const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => {
        for (const item of items) {
          const found = item.label === label ? item : item.submenu && find(item.submenu.items)
          if (found) return found
        }
      }
      const window = BrowserWindow.getAllWindows().find((window) => window.isVisible())!
      find(menu.items)!.click(undefined, window, window.webContents)
    },
    [label, from]
  )

/** The MIME types on the clipboard, and its text and HTML ('' when absent). */
const readClipboard = () =>
  s.app.evaluate(async ({ clipboard }) => {
    const items = await clipboard.read()
    const read = async (type: string): Promise<string> => {
      const item = items.find((item) => item.types.includes(type))
      return item ? ((await item.getType(type)) as Blob).text() : ''
    }
    return { types: items.flatMap((item) => item.types), text: await read('text/plain'), html: await read('text/html') }
  })

const PARAGRAPH = '.markdown p:has(strong)'

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  s = await start()
  await expect(s.page.locator(PARAGRAPH)).toBeVisible()
  // A native menu cannot be clicked from the test; it is kept here instead of shown.
  await s.app.evaluate(({ Menu }) => {
    const shown: Electron.Menu[] = []
    Object.assign(globalThis, { popups: shown })
    Menu.prototype.popup = function (this: Electron.Menu) {
      shown.push(this)
    }
  })
})
test.afterAll(() => stop(s))

test('issue 2: right-clicking selected text in the document offers Copy and Copy as Plain Text', async () => {
  await select(PARAGRAPH)
  const before = (await popups()).length
  // Within the selection: a right-click elsewhere in the document drops it.
  await s.page.locator(PARAGRAPH).click({ button: 'right' })
  await expect.poll(popups).toHaveLength(before + 1)
  expect((await popups()).at(-1)).toEqual(['Copy', 'Copy as Plain Text'])
})

test('issue 2: Copy in the context menu copies what Edit > Copy does', async () => {
  await select(PARAGRAPH)
  await s.app.evaluate(({ clipboard }) => clipboard.writeText('earlier'))
  await choose('Copy', 'menu')
  await expect.poll(async () => (await readClipboard()).text).not.toBe('earlier')
  const edit = await readClipboard()
  expect(edit.html).not.toBe('')

  await s.app.evaluate(({ clipboard }) => clipboard.writeText('earlier'))
  const before = (await popups()).length
  await s.page.locator(PARAGRAPH).click({ button: 'right' })
  await expect.poll(popups).toHaveLength(before + 1)
  await choose('Copy', 'popup')
  await expect.poll(async () => (await readClipboard()).text).not.toBe('earlier')
  expect(await readClipboard()).toEqual(edit)
})

test('issue 2: Copy as Plain Text copies the selected text and no markup', async () => {
  const text = await select(PARAGRAPH)
  await s.app.evaluate(({ clipboard, ClipboardItem }) =>
    clipboard.write([new ClipboardItem({ 'text/plain': 'earlier', 'text/html': '<b>earlier</b>' })])
  )
  const before = (await popups()).length
  await s.page.locator(PARAGRAPH).click({ button: 'right' })
  await expect.poll(popups).toHaveLength(before + 1)
  await choose('Copy as Plain Text', 'popup')
  await expect.poll(async () => (await readClipboard()).text).toBe(text)
  const copied = await readClipboard()
  expect(copied.html).toBe('')
  // Electron also lists the platform's own names for each format, such as X11's UTF8_STRING.
  expect(copied.types.filter((type) => !type.startsWith('electron application/osclipboard'))).toEqual(['text/plain'])
  expect(copied.types.filter((type) => type.includes('html'))).toEqual([])
})

test('issue 2: Copy as Plain Text keeps the line breaks of a selection across several blocks', async () => {
  const text = await select('.markdown h1', PARAGRAPH)
  expect(text).toContain('\n')
  const before = (await popups()).length
  await s.page.locator(PARAGRAPH).click({ button: 'right' })
  await expect.poll(popups).toHaveLength(before + 1)
  await choose('Copy as Plain Text', 'popup')
  await expect.poll(async () => (await readClipboard()).text).toBe(text)
})

test('issue 2: right-clicking the document with nothing selected shows no menu', async () => {
  await s.page.evaluate('getSelection().removeAllRanges()')
  const before = (await popups()).length
  await s.page.locator(PARAGRAPH).click({ button: 'right' })
  await settled()
  expect(await popups()).toHaveLength(before)
})

test('issue 2: right-clicking outside the document shows no menu, even with text selected', async () => {
  await clickMenu(s, 'Find…')
  await expect(s.page.locator('.find input')).toBeVisible()
  const before = (await popups()).length
  // As after Edit > Select All, so that the selection takes in the side panes too.
  for (const target of ['.tree .file.active', '.tab.active', '.toc button']) {
    await s.page.evaluate('getSelection().selectAllChildren(document.body)')
    await s.page.locator(target).first().click({ button: 'right' })
  }
  const input = s.page.locator('.find input')
  await input.fill('section')
  await input.selectText()
  await input.click({ button: 'right' })
  await s.page.keyboard.press('Escape')
  await clickMenu(s, 'About mdv')
  const about = s.page.locator('dialog.about')
  await expect(about.locator('.about-version')).toBeVisible()
  await s.page.evaluate('getSelection().selectAllChildren(document.body)')
  await about.locator('.about-version').click({ button: 'right' })
  await settled()
  expect(await popups()).toHaveLength(before)
  await s.page.keyboard.press('Escape')
  await expect(about).toHaveCount(0)
})

test('issue 2: right-clicking a link in a selection does not follow it', async () => {
  await select(PARAGRAPH)
  await s.page.locator('.markdown a', { hasText: 'relative link' }).click({ button: 'right' })
  await settled()
  await expect(s.page.locator('.tab.active span')).toHaveText('README.md')
  await expect(s.page.locator('.markdown h1')).toHaveText('Showcase')
})

test('logs no errors', () => {
  expect(s.errors).toEqual([])
})
