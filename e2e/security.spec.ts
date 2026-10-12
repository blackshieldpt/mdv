// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from '@playwright/test'
import { copyFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { heading, openFromTree, PROJECT, start, stop, tabs, type Session } from './harness'

let s: Session

/** How many content security policy violations the main window has logged. */
const violations = (): number => s.errors.filter((error) => error.includes('Content Security Policy')).length

test.describe.configure({ mode: 'serial' })
test.beforeAll(async () => {
  s = await start((docs) => {
    const image = join(docs, 'guide/logo.svg')
    // A picture a browser would recognise by its content, under an image name and another one.
    copyFileSync(join(PROJECT, 'build/icons/16x16.png'), join(docs, 'guide/pixels.png'))
    copyFileSync(join(PROJECT, 'build/icons/16x16.png'), join(docs, 'guide/pixels.txt'))
    writeFileSync(
      join(docs, 'unsafe.md'),
      `# Unsafe\n\n<img srcset="${image} 1x" alt="">\n\n<div style="background-image:url('${image}')">x</div>\n`
    )
    writeFileSync(
      join(docs, 'links.md'),
      '# Links\n\n[web](https://example.com/page) [mail](mailto:someone@example.com) [phone](tel:+123)\n' +
        '<a href="ftp://example.com/x">ftp</a> [missing](nowhere.md) [share](//example.invalid/share/x.md)\n'
    )
    writeFileSync(
      join(docs, 'diagram.md'),
      '# Diagram\n\n```mermaid\n' +
        '%%{init: {"themeCSS": ".nodeLabel { color: rgb(1, 2, 3) }", "themeVariables": {"primaryColor": "#010203"}}}%%\n' +
        'flowchart LR\n  A[Label] --> B[Plain]\n  click B href "https://example.com/from-diagram" _blank\n```\n'
    )
    writeFileSync(
      join(docs, 'cover.md'),
      '# Cover\n\n<div id="veil" style="position:fixed;inset:0;z-index:9999;background:red">cover</div>\n'
    )
  })
})
test.afterAll(() => stop(s))

test('runs with Chromium\'s sandbox on', async () => {
  expect(await s.app.evaluate(({ app }) => app.commandLine.hasSwitch('no-sandbox'))).toBe(false)
})

test('blocks local files referenced outside the image protocol', async () => {
  const before = violations()
  await openFromTree(s, 'unsafe.md', 'Unsafe')
  await expect.poll(() => violations() - before).toBe(2)
  await expect(s.page.locator('.markdown img')).toHaveJSProperty('naturalWidth', 0)
})

test('serves only images, and only relative to an open document', async () => {
  const image = s.page.locator('.markdown img')
  const width = async (base: string, src: string): Promise<number> => {
    const url = `mdv-file://local/?base=${encodeURIComponent(base)}&src=${encodeURIComponent(src)}`
    await image.evaluate((img, url) => {
      img.removeAttribute('srcset')
      img.setAttribute('src', url)
    }, url)
    await expect(image).toHaveJSProperty('complete', true)
    return image.evaluate((img) => img.naturalWidth)
  }
  expect(await width(join(s.docs, 'unsafe.md'), 'guide/logo.svg')).toBe(120)
  expect(await width(join(s.docs, 'unsafe.md'), 'guide/pixels.png')).toBe(16)
  // The same picture under a name that is not an image's.
  expect(await width(join(s.docs, 'unsafe.md'), 'guide/pixels.txt')).toBe(0)
  // A document that exists but is not open.
  expect(await width(join(s.docs, 'links.md'), 'guide/logo.svg')).toBe(0)
})

test('reads and lists only what it handed out itself', async () => {
  const attempt = (call: string): Promise<string> => s.page.evaluate(`${call}.then(() => 'allowed', () => 'refused')`)
  expect(await attempt(`window.mdv.readFile(${JSON.stringify(join(s.docs, 'README.md'))})`)).toBe('allowed')
  expect(await attempt(`window.mdv.readFile('/etc/hostname')`)).toBe('refused')
  expect(await attempt(`window.mdv.readFile(${JSON.stringify(join(s.docs, 'guide/pixels.txt'))})`)).toBe('refused')
  expect(await attempt(`window.mdv.readTree('/')`)).toBe('refused')
  expect(await attempt(`window.mdv.watchRoot('/')`)).toBe('refused')
  expect(await attempt(`window.mdv.watchFiles(['/etc/hostname'])`)).toBe('refused')
  // A link is followed only from a document that was handed out: it makes its target readable.
  const outside = join(s.home, 'outside.md')
  writeFileSync(outside, '# Outside\n')
  expect(await attempt(`window.mdv.resolveLink(${JSON.stringify(join(s.home, 'other.md'))}, 'outside.md')`)).toBe('refused')
  expect(await attempt(`window.mdv.readFile(${JSON.stringify(outside)})`)).toBe('refused')
})

test('hands only web and mail links to the system, and follows only links within reach', async () => {
  await s.app.evaluate(({ shell }) => {
    shell.openExternal = async (url) => {
      ;((globalThis as { opened?: string[] }).opened ??= []).push(url)
    }
  })
  await openFromTree(s, 'links.md', 'Links')
  const before = await tabs(s).allTextContents()
  for (const text of ['web', 'mail', 'phone', 'ftp', 'missing', 'share']) {
    await s.page.locator('.markdown a', { hasText: text }).click({ noWaitAfter: true })
  }
  await expect
    .poll(() => s.app.evaluate(() => (globalThis as { opened?: string[] }).opened))
    .toEqual(['https://example.com/page', 'mailto:someone@example.com'])
  await expect(heading(s, 'Links')).toBeVisible()
  expect(await tabs(s).allTextContents()).toEqual(before)
})

test('script that arrives as markup does not run', async () => {
  const before = violations()
  const ran = await s.page.evaluate(`(() => {
    const button = document.createElement('button')
    button.setAttribute('onclick', 'window.inlineScriptRan = true')
    document.body.append(button)
    button.click()
    button.remove()
    return window.inlineScriptRan === true
  })()`)
  expect(ran).toBe(false)
  await expect.poll(() => violations() - before).toBe(1)
})

test('a diagram cannot style the application or carry script', async () => {
  await openFromTree(s, 'diagram.md', 'Diagram')
  const diagram = s.page.locator('.markdown .mermaid-default')
  await expect(diagram.locator('svg')).toBeVisible()
  await expect(diagram).toContainText('Label')
  const css = await diagram.locator('svg style').first().textContent()
  expect(css).not.toContain('rgb(1, 2, 3)')
  expect(css).not.toContain('#010203')
  // Mermaid's output went through its sanitizer, which does not let a link ask for a new window.
  await expect(diagram.locator('a')).toHaveCount(1)
  await expect(diagram.locator('a[target]')).toHaveCount(0)
})

test('a document cannot paint over the rest of the window', async () => {
  await openFromTree(s, 'cover.md', 'Cover')
  await expect(s.page.locator('#user-content-veil')).toBeAttached()
  const under = (selector: string): Promise<boolean> =>
    s.page.evaluate(`(() => {
      const box = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect()
      const hit = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2)
      return hit.closest(${JSON.stringify(selector)}) !== null
    })()`)
  for (const pane of ['.tree', '.tabbar']) expect(await under(pane)).toBe(true)
})

// Last: see the note inside.
test('the window cannot be navigated away or made to open another', async () => {
  const url = s.page.url()
  expect(await s.page.evaluate(`window.open('https://example.invalid/') === null`)).toBe(true)
  await s.page.evaluate(`void setTimeout(() => { location.href = 'https://example.invalid/' }, 0)`)
  await s.page.waitForTimeout(1000)
  expect(s.page.url()).toBe(url)
  expect(s.app.windows().length).toBe(1)
  // Read directly: after a refused navigation Playwright's own locators keep waiting for it.
  expect(await s.page.evaluate(`document.querySelector('.markdown h1').textContent`)).toBe('Cover')
})
