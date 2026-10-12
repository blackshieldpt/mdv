// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '@playwright/test'
import { spawn } from 'child_process'
import { readFileSync, renameSync, rmSync, writeFileSync } from 'fs'
import { join } from 'path'
import { clickMenu, exportPdf, heading, openFromTree, pdfTextSize, PROJECT, start, stop, tabs, type Session } from './harness'

let s: Session

const scrollTop = (): Promise<number> => s.page.locator('.doc-scroller').evaluate((el) => el.scrollTop)

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  s = await start()
})
test.afterAll(() => stop(s))

test('opens a folder with its README, file tree and contents', async () => {
  await expect(heading(s, 'Showcase')).toBeVisible()
  await expect(s.page).toHaveTitle('README.md — mdv')
  await expect(s.page.locator('.tree .dir')).toHaveText(['guide'])
  await expect(s.page.locator('.tree .file.active')).toHaveText('README.md')
  await expect(s.page.locator('.toc button')).toHaveText([
    'Showcase',
    'Code',
    'Tables',
    'Lists',
    'Math',
    'Diagram',
    'Quotes',
    'Long section',
    'Final section'
  ])
})

test('renders highlighted code, math, diagrams and local images', async () => {
  await expect(s.page.locator('.markdown pre.shiki .line span[style]').first()).toBeVisible()
  await expect(s.page.locator('.markdown .katex-display')).toBeVisible()
  await expect(s.page.locator('.markdown .mermaid-default svg')).toBeVisible()
  // The dark variant is rendered too, and shown only under the dark theme.
  await expect(s.page.locator('.markdown .mermaid-dark svg')).toBeAttached()
  await expect(s.page.locator('.markdown .mermaid-dark svg')).toBeHidden()
  await expect(s.page.locator('.markdown img')).toHaveJSProperty('naturalWidth', 120)
})

test('contents jump to a heading and follow the scroll position', async () => {
  await s.page.locator('.toc button', { hasText: 'Math' }).click()
  await expect(heading(s, 'Math')).toBeInViewport()
  await expect(s.page.locator('.toc button.active')).toHaveText('Math')
  await heading(s, 'Tables').scrollIntoViewIfNeeded()
  await expect(s.page.locator('.toc button.active')).toHaveText(/^(Code|Tables)$/)
})

test('find highlights matches in the document and steps through them', async () => {
  const highlighted = (): Promise<number> => s.page.evaluate(`CSS.highlights.get('find')?.size ?? -1`)
  await clickMenu(s, 'Find…')
  const input = s.page.locator('.find input')
  const count = s.page.locator('.find-count')
  await expect(input).toBeFocused()

  // The contents pane lists both headings too; only the document is searched.
  await input.fill('SECTION')
  await expect(count).toHaveText('1 / 2')
  await expect.poll(highlighted).toBe(2)
  await expect(heading(s, 'Long section')).toBeInViewport()
  await input.press('Enter')
  await expect(count).toHaveText('2 / 2')
  await expect(heading(s, 'Final section')).toBeInViewport()
  await input.press('Enter')
  await expect(count).toHaveText('1 / 2')
  await input.press('Shift+Enter')
  await expect(count).toHaveText('2 / 2')

  // Across inline elements, and across a line break in the source.
  await input.fill('Markdown document')
  await expect(count).toHaveText('1 / 1')
  await input.fill('P, a relative link')
  await expect(count).toHaveText('1 / 1')
  // Not in collapsed sections or in the hidden copy of a formula.
  await input.fill('Hidden until opened')
  await expect(count).toHaveText('No results')
  await input.fill('infty')
  await expect(count).toHaveText('No results')

  await input.fill('section')
  await input.press('Escape')
  await expect(s.page.locator('.find')).toHaveCount(0)
  await expect.poll(highlighted).toBe(-1)
})

test('find keeps its place when the document is reloaded', async () => {
  await clickMenu(s, 'Find…')
  const input = s.page.locator('.find input')
  await input.fill('section')
  await input.press('Enter')
  await expect(s.page.locator('.find-count')).toHaveText('2 / 2')
  // The reader moves away from the match; a reload must not pull the view back to it.
  await heading(s, 'Code').scrollIntoViewIfNeeded()
  const position = await scrollTop()

  const file = join(s.docs, 'README.md')
  writeFileSync(file, readFileSync(file, 'utf8') + '\nAppended line.\n')
  await expect(s.page.locator('.markdown')).toContainText('Appended line.')
  await expect(s.page.locator('.find-count')).toHaveText('2 / 2')
  expect(await scrollTop()).toBe(position)
  await input.press('Escape')
})

test('exports a PDF with contents, page numbers, file name and working links', async () => {
  const pages = await exportPdf(s, 'full.pdf', { 'Table of contents': true, 'Page numbers': true, 'File name': true })
  expect(pages.length).toBeGreaterThan(3)
  for (const [index, text] of pages.entries()) {
    expect(text).toContain('README.md')
    expect(text).toContain(`${index + 1} / ${pages.length}`)
  }
  expect(pages[0]).toContain('Contents')
  expect(pages[0]).not.toContain('Lorem ipsum')
  expect(pages[1]).toContain('A Markdown document')

  // Each contents entry carries the number of the page its heading is printed on.
  for (const title of ['Diagram', 'Long section', 'Final section']) {
    const number = pages.findIndex((text, index) => index > 0 && text.includes(title)) + 1
    expect(number).toBeGreaterThan(1)
    expect(pages[0]).toMatch(new RegExp(`${title}\\s*${number}\\b`))
  }
  const pdf = readFileSync(join(s.docs, 'full.pdf'), 'latin1')
  expect(pdf).toContain('/Outlines')
  // The footnote reference and its way back are links with a destination.
  for (const name of ['footnote1', 'footnote-ref1']) {
    expect(pdf).toContain(`/Dest /user-content-${name}`)
    expect(pdf).toContain(`/user-content-${name} [`)
  }
  // Links to other documents cannot work in a PDF and are plain text there.
  expect(pdf).not.toContain('intro.md')
})

test('exports a plain PDF when the options are off, and remembers them', async () => {
  const pages = await exportPdf(s, 'plain.pdf', { 'Table of contents': false, 'Page numbers': false, 'File name': false })
  expect(pages[0].trimStart().startsWith('Showcase')).toBe(true)
  expect(pages.join(' ')).not.toContain('README.md')
  expect(pages.join(' ')).not.toMatch(/\d+ \/ \d+/)

  await clickMenu(s, 'Export as PDF…')
  const dialog = s.page.locator('dialog.print-dialog')
  for (const label of ['Table of contents', 'Page numbers', 'File name']) await expect(dialog.getByLabel(label)).not.toBeChecked()
  await dialog.getByRole('button', { name: 'Cancel' }).click()
  await expect(dialog).toHaveCount(0)
})

test('printing hands the laid-out document to the system print dialog', async () => {
  // The system print dialog cannot be driven, so its entry point is replaced by a recorder. It
  // also checks that the print window does not run script that arrives as markup.
  await s.app.evaluate(({ app }) => {
    app.once('browser-window-created', (_event, window) => {
      window.webContents.print = async (options, callback) => {
        const probe = `(() => {
          const button = document.createElement('button')
          button.setAttribute('onclick', 'window.inlineScriptRan = true')
          document.body.append(button)
          button.click()
          return { headings: document.querySelectorAll('.markdown h2').length, inlineScriptRan: window.inlineScriptRan === true }
        })()`
        const page = await window.webContents.executeJavaScript(probe)
        Object.assign(globalThis, { printed: { options, ...page, visible: window.isVisible() } })
        callback!(true, '')
      }
    })
  })
  await clickMenu(s, 'Print…')
  await s.page.locator('dialog.print-dialog').getByRole('button', { name: 'Print…' }).click()
  await expect
    .poll(() => s.app.evaluate(() => (globalThis as { printed?: unknown }).printed))
    .toEqual({ options: { printBackground: true }, headings: 8, inlineScriptRan: false, visible: false })
  await expect.poll(() => s.app.windows().length).toBe(1)
})

test('a link replaces the document in the current tab', async () => {
  await s.page.locator('.markdown a', { hasText: 'relative link' }).click()
  await expect(heading(s, 'Introduction')).toBeVisible()
  await expect(tabs(s)).toHaveText(['intro.md'])
  await expect(s.page.locator('.tree .file.active')).toHaveText('intro.md')
})

test('back and forward retrace the documents shown', async () => {
  const back = s.page.getByRole('button', { name: 'Back' })
  const forward = s.page.getByRole('button', { name: 'Forward' })
  await expect(forward).toBeDisabled()
  await back.click()
  await expect(heading(s, 'Showcase')).toBeVisible()
  await expect(tabs(s)).toHaveText(['README.md'])
  await expect(back).toBeDisabled()
  await clickMenu(s, 'Forward')
  await expect(heading(s, 'Introduction')).toBeVisible()
  await expect(tabs(s)).toHaveText(['intro.md'])
  await expect(forward).toBeDisabled()
  await clickMenu(s, 'Back')
  await expect(heading(s, 'Showcase')).toBeVisible()
  // Going somewhere else drops the forward history.
  await s.page.locator('.markdown a', { hasText: 'relative link' }).click()
  await expect(heading(s, 'Introduction')).toBeVisible()
  await expect(forward).toBeDisabled()
})

test('the file tree opens files in new tabs', async () => {
  await openFromTree(s, 'README.md', 'Showcase')
  await expect(tabs(s)).toHaveText(['intro.md', 'README.md'])
  await expect(s.page.locator('.tab.active span')).toHaveText('README.md')
})

test('the menu cycles through tabs and hides the side panes', async () => {
  const active = s.page.locator('.tab.active span')
  await clickMenu(s, 'Next Tab')
  await expect(active).toHaveText('intro.md')
  await clickMenu(s, 'Next Tab')
  await expect(active).toHaveText('README.md')
  await clickMenu(s, 'Previous Tab')
  await expect(active).toHaveText('intro.md')
  await clickMenu(s, 'Previous Tab')
  await expect(active).toHaveText('README.md')

  for (const [label, pane] of [['Toggle File Tree', '.tree'], ['Toggle Table of Contents', '.toc']]) {
    await expect(s.page.locator(pane)).toBeVisible()
    await clickMenu(s, label)
    await expect(s.page.locator(pane)).toHaveCount(0)
    await clickMenu(s, label)
    await expect(s.page.locator(pane)).toBeVisible()
  }
})

test('the side panes are resized by dragging and collapsed by their buttons', async () => {
  const panes = [
    ['left', 'file tree', '.tree', 1],
    ['right', 'table of contents', '.toc', -1]
  ] as const
  for (const [side, name, content, inwards] of panes) {
    const width = (): Promise<number> => s.page.locator(`.pane.${side}`).evaluate((el) => el.getBoundingClientRect().width)
    const drag = async (by: number): Promise<void> => {
      const edge = (await s.page.locator(`.pane.${side} .pane-resizer`).boundingBox())!
      const x = edge.x + edge.width / 2
      await s.page.mouse.move(x, edge.y + 200)
      await s.page.mouse.down()
      await s.page.mouse.move(x + by, edge.y + 200, { steps: 4 })
      await s.page.mouse.up()
    }
    const before = await width()
    await drag(80 * inwards)
    await expect.poll(async () => Math.abs((await width()) - before - 80)).toBeLessThan(2)
    const wider = await width()
    expect(await s.page.evaluate((side) => localStorage.getItem(`mdv.paneWidth.${side}`), side)).toBe(String(wider))

    await s.page.getByRole('button', { name: `Collapse ${name}` }).click()
    await expect(s.page.locator(content)).toHaveCount(0)
    expect(await width()).toBeLessThan(40)
    await s.page.getByRole('button', { name: `Expand ${name}` }).click()
    await expect(s.page.locator(content)).toBeVisible()
    expect(await width()).toBe(wider)

    await drag(-80 * inwards)
    await expect.poll(async () => Math.abs((await width()) - before)).toBeLessThan(2)
  }
})

test('tabs remember their scroll position', async () => {
  await s.page.locator('.toc button', { hasText: 'Final section' }).click()
  const position = await scrollTop()
  expect(position).toBeGreaterThan(0)
  await tabs(s).filter({ hasText: 'intro.md' }).click()
  await expect(heading(s, 'Introduction')).toBeVisible()
  await tabs(s).filter({ hasText: 'README.md' }).click()
  await expect(heading(s, 'Final section')).toBeInViewport()
  await expect.poll(scrollTop).toBe(position)
})

test('a link to an open file switches to its tab at the anchor', async () => {
  await tabs(s).filter({ hasText: 'intro.md' }).click()
  await s.page.locator('.markdown a', { hasText: 'overview' }).click()
  await expect(s.page.locator('.tab.active span')).toHaveText('README.md')
  await expect(tabs(s)).toHaveCount(2)
  await expect(heading(s, 'Tables')).toBeInViewport()
})

test('reloads a document changed on disk, in a background tab too', async () => {
  writeFileSync(join(s.docs, 'README.md'), '# Rewritten\n')
  await expect(heading(s, 'Rewritten')).toBeVisible()
  // Many editors save by renaming a temporary file over the original.
  writeFileSync(join(s.docs, 'guide/intro.md.tmp'), '# Changed\n')
  renameSync(join(s.docs, 'guide/intro.md.tmp'), join(s.docs, 'guide/intro.md'))
  await tabs(s).filter({ hasText: 'intro.md' }).click()
  await expect(heading(s, 'Changed')).toBeVisible()
})

test('keeps reloading a document that was deleted and created again', async () => {
  const file = join(s.docs, 'guide/intro.md')
  rmSync(file)
  await expect(s.page.locator('.tree .file', { hasText: 'intro.md' })).toHaveCount(0)
  writeFileSync(file, '# Recreated\n')
  await expect(heading(s, 'Recreated')).toBeVisible()
  writeFileSync(file, '# Edited again\n')
  await expect(heading(s, 'Edited again')).toBeVisible()
})

test('the file tree follows the file system', async () => {
  writeFileSync(join(s.docs, 'new.md'), '# New\n')
  await expect(s.page.locator('.tree .file', { hasText: 'new.md' })).toBeVisible()
  rmSync(join(s.docs, 'new.md'))
  await expect(s.page.locator('.tree .file', { hasText: 'new.md' })).toHaveCount(0)
})

test('says so when a document cannot be read, and shows it once it can', async () => {
  const file = join(s.docs, 'fleeting.md')
  writeFileSync(join(s.docs, 'onward.md'), '# Onward\n')
  writeFileSync(file, '# Fleeting\n\n[on](onward.md)\n')
  await openFromTree(s, 'fleeting.md', 'Fleeting')
  // The link replaces the document in its tab, so only Back leads to it again; then remove it.
  await s.page.locator('.markdown a', { hasText: 'on' }).click()
  await expect(heading(s, 'Onward')).toBeVisible()
  rmSync(file)
  await expect(s.page.locator('.tree .file', { hasText: 'fleeting.md' })).toHaveCount(0)
  await clickMenu(s, 'Back')
  await expect(s.page.locator('.main')).toContainText('fleeting.md cannot be read.')
  writeFileSync(file, '# Back again\n')
  await expect(heading(s, 'Back again')).toBeVisible()
  await clickMenu(s, 'Close Tab')
  rmSync(file)
  rmSync(join(s.docs, 'onward.md'))
})

test('a file chosen in the open dialog opens in a tab', async () => {
  const file = join(s.docs, 'guide/chosen.md')
  writeFileSync(file, '# Chosen\n')
  await s.app.evaluate(({ dialog }, file) => {
    dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [file] })
  }, file)
  await clickMenu(s, 'Open File…')
  await expect(heading(s, 'Chosen')).toBeVisible()
  await expect(s.page.locator('.tab.active span')).toHaveText('chosen.md')
  // The folder that is open stays in the file tree.
  await expect(s.page.locator('.tree .pane-title')).toHaveText('docs')
  await clickMenu(s, 'Close Tab')
  rmSync(file)
})

test('a file opened with no folder open shows its own folder in the file tree', async () => {
  const other = await start(undefined, 'guide/intro.md')
  try {
    await expect(heading(other, 'Introduction')).toBeVisible()
    await expect(other.page.locator('.tree .pane-title')).toHaveText('guide')
    await expect(other.page.locator('.tree .file')).toHaveText(['intro.md'])
  } finally {
    await stop(other)
  }
})

test('exported tables keep their words whole and fit the page', async () => {
  const file = join(s.docs, 'tables.md')
  const wide = ['Host', 'Address', 'Port', 'Protocol', 'Service', 'Version', 'State', 'Owner', 'Environment', 'Notes']
  const wider = [...wide, 'Datacenter', 'Maintainer']
  const table = (head: string[], body: string[]): string =>
    `| ${head.join(' | ')} |\n|${'-|'.repeat(head.length)}\n| ${body.join(' | ')} |\n`
  writeFileSync(
    file,
    [
      '# Tables',
      table(['ID', 'Severity', 'Finding', 'Status'], ['S2', 'Medium', 'A finding described at some length. '.repeat(8), 'Fixed']),
      table(['Key', 'Value'], ['Address', `https://example.com/${'path/'.repeat(40)}end`]),
      table(wider, wider.map((name) => name.toLowerCase())),
      table(wide, wide.map((name) => `${name}OfConsiderableLength`))
    ].join('\n')
  )
  await openFromTree(s, 'tables.md', 'Tables')
  const text = (await exportPdf(s, 'tables.pdf', {})).join(' ')
  // Narrow columns beside a long one, or beside a long URL, are not squeezed until their words break.
  expect(text).toContain('ID Severity Finding Status')
  expect(text).toContain('S2 Medium')
  expect(text).toContain('Address https://')
  // A table somewhat wider than the page is shrunk, with its words whole.
  expect(text).toContain(wider.join(' ').toLowerCase())
  // Chromium scales the whole page down when anything is wider than it: the title, 2em of 9.5pt, keeps its size.
  expect(await pdfTextSize(join(s.docs, 'tables.pdf'), 'Tables')).toBeCloseTo(19, 1)
  await clickMenu(s, 'Close Tab')
  rmSync(file)
})

test('find copes with a very large number of matches', async () => {
  writeFileSync(join(s.docs, 'big.md'), '# Big\n\n' + 'e e e e e e e e e e e e e e e e e e e e\n\n'.repeat(9000))
  await openFromTree(s, 'big.md', 'Big')
  await clickMenu(s, 'Find…')
  await s.page.locator('.find input').fill('e')
  await expect(s.page.locator('.find-count')).toHaveText('1 / 10000+', { timeout: 20000 })
  await s.page.locator('.find input').press('Escape')
  await clickMenu(s, 'Close Tab')
  rmSync(join(s.docs, 'big.md'))
})

test('closing the last tab returns to the welcome screen, and drops a pending print request', async () => {
  await s.page.locator('.tab', { hasText: 'README.md' }).locator('button').click()
  await expect(tabs(s)).toHaveText(['intro.md'])
  await clickMenu(s, 'Print…')
  await expect(s.page.locator('dialog.print-dialog')).toBeVisible()
  await clickMenu(s, 'Close Tab')
  await expect(tabs(s)).toHaveCount(0)
  await expect(s.page.locator('.welcome')).toBeVisible()
  await expect(s.page.locator('dialog.print-dialog')).toHaveCount(0)
  await expect(s.page).toHaveTitle('mdv')
  // Asking to find or print with nothing open does nothing, now or when a document opens later.
  await clickMenu(s, 'Find…')
  await clickMenu(s, 'Print…')
})

test('logs no errors', () => {
  expect(s.errors).toEqual([])
})

test('about dialog shows versions and the license of every component', async () => {
  await clickMenu(s, 'About mdv')
  const about = s.page.locator('dialog.about')
  await expect(about.locator('.about-version')).toHaveText(`Version ${JSON.parse(readFileSync(join(PROJECT, 'package.json'), 'utf8')).version}`)
  await expect(about.locator('dd')).toHaveText([/^\d+\.\d+\.\d+/, /^\d+\.\d+\.\d+\.\d+$/, /^\d+\.\d+\.\d+/, /^\d+\.\d+/])
  await about.locator('summary', { hasText: 'mdv license' }).click()
  await expect(about.locator('pre').first()).toContainText('Copyright 2026 BlackShield LDA')

  const licenses: Record<string, string> = {
    '@fontsource-variable/inter': 'OFL-1.1',
    chokidar: 'MIT',
    dompurify: '(MPL-2.0 OR Apache-2.0)',
    electron: 'MIT',
    elkjs: 'EPL-2.0',
    'markdown-it': 'MIT',
    mermaid: 'MIT',
    react: 'MIT'
  }
  for (const [name, license] of Object.entries(licenses)) {
    const row = about.locator('li summary').filter({ has: s.page.getByText(name, { exact: true }) })
    await expect(row.locator('.about-license')).toHaveText(license)
  }
  const elk = about.locator('li').filter({ has: s.page.getByText('elkjs', { exact: true }) })
  await elk.locator('summary').click()
  await expect(elk.locator('pre')).toContainText('Eclipse Public License')
  await expect(elk.locator('.about-link')).toHaveText(/^https:\/\//)
  await expect(about.getByText('This package does not include a license text.')).toHaveCount(0)

  await s.page.keyboard.press('Escape')
  await expect(about).toHaveCount(0)
})

test('the build writes a third-party notices file', () => {
  const notices = readFileSync(join(PROJECT, 'out/renderer/THIRD-PARTY-NOTICES.txt'), 'utf8')
  expect(notices).toContain('elkjs')
  expect(notices).toContain('Eclipse Public License')
  expect(notices).toContain('SIL OPEN FONT LICENSE')
})

test('a second launch opens its file in the running window and exits', async () => {
  // Started from another directory with a relative path, which the running instance must resolve.
  const second = spawn(require('electron') as unknown as string, [...s.launchArgs, 'guide/intro.md'], { cwd: s.docs })
  try {
    expect(await new Promise((resolve) => second.once('exit', resolve))).toBe(0)
  } finally {
    second.kill()
  }
  await expect(s.page.locator('.tab.active span')).toHaveText('intro.md')
  await expect(heading(s, 'Edited again')).toBeVisible()
  // The requests made on the welcome screen did not wait for this document.
  await expect(s.page.locator('.find, dialog.print-dialog')).toHaveCount(0)
})
