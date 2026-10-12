// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { _electron as electron, expect, type ElectronApplication, type Locator, type Page } from '@playwright/test'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'

export const PROJECT = join(__dirname, '..')

/** One running copy of the application, on a private copy of the fixture documents. */
export interface Session {
  app: ElectronApplication
  page: Page
  /** The opened folder. */
  docs: string
  /** Everything a launch needs before the paths to open. */
  launchArgs: string[]
  /** Console errors and uncaught exceptions of the main window. */
  errors: string[]
  /** Holds `docs` and the profile; removed by `stop`. */
  home: string
}

/**
 * Launches the application on the fixture folder, or on `target` inside it; `prepare` can add
 * documents to the folder first.
 */
export async function start(prepare?: (docs: string) => void, target = ''): Promise<Session> {
  const home = mkdtempSync(join(tmpdir(), 'mdv-e2e-'))
  const docs = join(home, 'docs')
  cpSync(join(__dirname, 'fixtures/docs'), docs, { recursive: true })
  prepare?.(docs)
  // A profile of its own keeps the run apart from any other instance and its settings.
  const launchArgs = [`--user-data-dir=${join(home, 'profile')}`, PROJECT]
  // Playwright turns Chromium's sandbox off unless told otherwise; the application ships with it on.
  const app = await electron.launch({ args: [...launchArgs, join(docs, target)], chromiumSandbox: true })
  const page = await app.firstWindow()
  const errors: string[] = []
  page.on('console', (message) => message.type() === 'error' && errors.push(message.text()))
  page.on('pageerror', (error) => errors.push(error.message))
  return { app, page, docs, launchArgs, errors, home }
}

export async function stop(session: Session | undefined): Promise<void> {
  if (!session) return
  await session.app.close()
  rmSync(session.home, { recursive: true, force: true })
}

export async function clickMenu({ app }: Session, label: string): Promise<void> {
  await app.evaluate(({ Menu }, label) => {
    const find = (items: Electron.MenuItem[]): Electron.MenuItem | undefined => {
      for (const item of items) {
        const found = item.label === label ? item : item.submenu && find(item.submenu.items)
        if (found) return found
      }
    }
    const item = find(Menu.getApplicationMenu()!.items)
    if (!item) throw new Error(`No menu item is labelled "${label}"`)
    item.click()
  }, label)
}

export const heading = ({ page }: Session, text: string): Locator =>
  page.locator('.markdown :is(h1, h2)', { hasText: text })

export const tabs = ({ page }: Session): Locator => page.locator('.tab span')

/** Opens a document from the file tree and waits for its first heading. */
export async function openFromTree(session: Session, name: string, title: string): Promise<void> {
  await session.page.locator('.tree .file', { hasText: name }).click()
  await expect(heading(session, title)).toBeVisible()
}

export async function pdfPages(file: string): Promise<string[]> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)) }).promise
  const pages: string[] = []
  for (let number = 1; number <= pdf.numPages; number++) {
    const { items } = await (await pdf.getPage(number)).getTextContent()
    pages.push(items.map((item) => ('str' in item ? item.str : '')).join(' ').replace(/\s+/g, ' '))
  }
  return pages
}

/** The font size, in points, of the first piece of text in a PDF that reads exactly `text`. */
export async function pdfTextSize(file: string, text: string): Promise<number> {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const pdf = await getDocument({ data: new Uint8Array(readFileSync(file)) }).promise
  for (let number = 1; number <= pdf.numPages; number++) {
    for (const item of (await (await pdf.getPage(number)).getTextContent()).items) {
      if ('str' in item && item.str === text) return Math.hypot(item.transform[0], item.transform[1])
    }
  }
  throw new Error(`The PDF has no text "${text}"`)
}

/** Exports the active document through the options dialog and returns the text of each PDF page. */
export async function exportPdf(session: Session, name: string, options: Record<string, boolean>): Promise<string[]> {
  const { app, page, docs } = session
  const out = join(docs, name)
  await app.evaluate(({ dialog }, filePath) => {
    dialog.showSaveDialog = async () => ({ canceled: false, filePath })
  }, out)
  await clickMenu(session, 'Export as PDF…')
  const dialog = page.locator('dialog.print-dialog')
  for (const [label, checked] of Object.entries(options)) await dialog.getByLabel(label).setChecked(checked)
  await dialog.getByRole('button', { name: 'Export…' }).click()
  // The file is complete once it exists and the hidden print window has gone.
  await expect.poll(() => existsSync(out), { timeout: 30000 }).toBe(true)
  await expect.poll(() => app.windows().length).toBe(1)
  return pdfPages(out)
}
