// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

// @vitest-environment jsdom
import { describe, expect, test, vi } from 'vitest'
import { domId } from '../../shared/types'
import { renderMarkdown, sanitize } from './markdown'

async function dom(source: string): Promise<HTMLElement> {
  const container = document.createElement('div')
  container.append(sanitize((await renderMarkdown(source)).html))
  return container
}

describe('rendering', () => {
  test('highlights fenced code with both themes', async () => {
    const el = await dom('```ts\nconst a: number = 1\n```')
    const pre = el.querySelector('pre.shiki')!
    expect(pre.textContent).toBe('const a: number = 1')
    const token = pre.querySelector('.line span')!.getAttribute('style')!
    expect(token).toContain('--shiki-light:')
    expect(token).toContain('--shiki-dark:')
  })

  test('accepts language aliases, upper case and extra fence info', async () => {
    const el = await dom('```JS title="x"\nlet a = 1\n```')
    expect(el.querySelectorAll('pre.shiki .line span[style]').length).toBeGreaterThan(1)
  })

  test('renders unknown languages as plain text', async () => {
    const el = await dom('```nosuchlang\n<b>raw</b>\n```')
    expect(el.querySelector('pre.shiki')!.textContent).toBe('<b>raw</b>')
    expect(el.querySelector('pre b')).toBeNull()
  })

  test('supports GFM tables, strikethrough, autolinks and task lists', async () => {
    const el = await dom('| a | b |\n|:--|--:|\n| 1 | 2 |\n\n~~gone~~ https://example.com\n\n- [x] done\n- [ ] todo\n')
    expect(el.querySelectorAll('table td').length).toBe(2)
    expect(el.querySelector('td:last-child')!.getAttribute('style')).toContain('text-align:right')
    expect(el.querySelector('s')!.textContent).toBe('gone')
    expect(el.querySelector('a')!.getAttribute('href')).toBe('https://example.com')
    const boxes = el.querySelectorAll<HTMLInputElement>('input[type=checkbox]')
    expect([...boxes].map((box) => [box.checked, box.disabled])).toEqual([
      [true, true],
      [false, true]
    ])
  })

  test('supports alerts, footnotes, definition lists and emoji', async () => {
    const el = await dom('> [!WARNING]\n> careful\n\ntext[^1] :tada:\n\n[^1]: the note\n\nTerm\n: Definition\n')
    expect(el.querySelector('.markdown-alert-warning')!.textContent).toContain('careful')
    expect(el.querySelector('.footnotes li')!.textContent).toContain('the note')
    expect(el.querySelector('dl dd')!.textContent).toBe('Definition')
    expect(el.textContent).toContain('🎉')
  })

  test('renders inline, block and fenced math with KaTeX', async () => {
    const el = await dom('inline $x^2$\n\n$$\nE=mc^2\n$$\n\n```math\na+b\n```\n')
    expect(el.querySelectorAll('.katex').length).toBe(3)
    expect(el.querySelectorAll('.katex-display').length).toBe(2)
    expect(el.querySelector('annotation')!.textContent).toBe('x^2')
  })

  test('does not carry KaTeX macros from one document into the next', async () => {
    await dom('$\\gdef\\alpha{999}\\alpha$')
    const el = await dom('$\\alpha + 1$')
    expect(el.querySelector('.katex-html')!.textContent).toBe('α+1')
  })

  test('limits sizes a formula can ask for', async () => {
    const el = await dom('$\\rule{50000em}{50000em}$')
    const rendered = el.querySelector('.katex-html')!.innerHTML
    expect(rendered).not.toContain('50000em')
    expect(rendered).toContain('500em')
  })

  test('renders a fence named after an object property as plain text', async () => {
    const el = await dom('```constructor\nx\n```\n\n```__proto__\ny\n```')
    expect([...el.querySelectorAll('pre.shiki')].map((pre) => pre.textContent)).toEqual(['x', 'y'])
  })

  test('leaves mermaid sources for the diagram renderer', async () => {
    const el = await dom('```mermaid\ngraph TD\n  A-->B\n```')
    expect(el.querySelector('pre.mermaid')!.textContent).toBe('graph TD\n  A-->B\n')
    expect(el.querySelector('.shiki')).toBeNull()
  })

  test('hides YAML front matter', async () => {
    const el = await dom('---\ntitle: Secret\n---\n\n# Shown\n')
    expect(el.textContent).not.toContain('Secret')
    expect(el.querySelector('h1')!.textContent).toBe('Shown')
  })
})

/** The light-theme colour of the first token starting with each of `texts`, or `plain`. */
async function tokenColours(lang: string, code: string, texts: string[]): Promise<(string | 'plain')[]> {
  const pre = (await dom('```' + lang + '\n' + code + '\n```')).querySelector('pre.shiki')!
  const light = (el: Element): string | undefined => /--shiki-light:([^;]+)/.exec(el.getAttribute('style') ?? '')?.[1]
  const plain = light(pre)
  const spans = [...pre.querySelectorAll('.line span')]
  return texts.map((text) => {
    const span = spans.find((s) => s.textContent!.trim().startsWith(text))
    expect(span, `a token starting with ${text}`).toBeDefined()
    const colour = light(span!)
    return !colour || colour.toLowerCase() === plain?.toLowerCase() ? 'plain' : colour
  })
}

const fenceHtml = async (lang: string, code: string): Promise<string> =>
  (await dom('```' + lang + '\n' + code + '\n```')).querySelector('pre')!.outerHTML

describe('assembly highlighting (#5)', () => {
  const X86 = 'start: mov eax, 1 ; c'

  test.each(['nasm', 'x86asm', 'masm', 'gas', 's'])('claim 1: %s renders the same tokens as asm', async (lang) => {
    expect(await fenceHtml(lang, X86)).toBe(await fenceHtml('asm', X86))
  })

  test.each(['arm', 'armasm'])('claim 2: %s colours mnemonic, register and comment', async (lang) => {
    const colours = await tokenColours(lang, 'loop: ldr r0, [r1, #4] @ load it', ['ldr', 'r0', '@ load'])
    expect(colours).not.toContain('plain')
  })

  test.each(['arm64', 'aarch64'])('claim 3: %s colours mnemonic, register and comment', async (lang) => {
    const colours = await tokenColours(lang, 'ldr x0, [x1, #8] // load it', ['ldr', 'x0', '// load'])
    expect(colours).not.toContain('plain')
  })

  test('claim 4: z80 colours mnemonic, register and comment', async () => {
    const colours = await tokenColours('z80', '  ld a, (hl) ; load it', ['ld', 'a', '; load'])
    expect(colours).not.toContain('plain')
  })

  test.each(['6502', '65c02'])('claim 5: %s colours mnemonics and both kinds of comment', async (lang) => {
    const code = 'loop: lda #$01 ; trailing words\n  stz $20\n; whole line'
    const [lda, stz, trailing, whole, label] = await tokenColours(lang, code, [
      'lda',
      'stz',
      '; trailing',
      '; whole',
      'loop'
    ])
    expect([lda, stz, trailing, whole]).not.toContain('plain')
    expect(trailing).not.toBe(label)
  })

  test('claim 6: avr colours mnemonic, register and comment', async () => {
    const colours = await tokenColours('avr', '  ldi r16, 0xFF ; load it', ['ldi', 'r16', '; load'])
    expect(colours).not.toContain('plain')
  })

  test('claim 7: names are case-insensitive and ignore extra fence info', async () => {
    const code = 'ldr x0, [x1, #8]'
    const arm64 = await fenceHtml('arm64', code)
    expect(arm64.match(/<span style=/g)!.length).toBeGreaterThan(1)
    expect(await fenceHtml('AArch64 title="x"', code)).toBe(arm64)
    expect(await fenceHtml('NASM', X86)).toBe(await fenceHtml('asm', X86))
  })

  test('claim 1: an alias written with character references renders like asm', async () => {
    // A fresh module, so `asm` is not already loaded by an earlier render.
    vi.resetModules()
    const fresh = await import('./markdown')
    const render = async (lang: string): Promise<string> => {
      const container = document.createElement('div')
      container.append(fresh.sanitize((await fresh.renderMarkdown('```' + lang + '\n' + X86 + '\n```')).html))
      return container.querySelector('pre')!.outerHTML
    }
    await expect(render('&#110;asm')).resolves.toBe(await fenceHtml('asm', X86))
  })

  test('claim 8: unknown names stay plain, including ones next to the new names', async () => {
    for (const lang of ['nosuchasm', 'arm32', 'nasmx', '6800']) {
      const el = await dom('```' + lang + '\nmov eax, 1 ; c\n```')
      expect(el.querySelectorAll('pre.shiki .line span[style]').length, lang).toBe(0)
    }
  })

  test('guard: a line built to make the 6502 grammar backtrack renders promptly', async () => {
    await dom('```6502\nlda #1\n```')
    const line = 'foo a' + 'A'.repeat(40) + '_'
    const start = performance.now()
    await dom('```6502\n' + Array(20).fill(line).join('\n') + '\n```')
    expect(performance.now() - start).toBeLessThan(1000)
  })

  test('guard: asm still colours x86 labels, mnemonics, registers and comments', async () => {
    expect(await tokenColours('asm', X86, ['start:', 'mov', 'eax', '; c'])).not.toContain('plain')
  })

  test('claim 2: a vendored grammar, its alias and a bundled language highlight in one document', async () => {
    const el = await dom('```ts\nconst a: number = 1\n```\n\n```armasm\nmov r0, #1\n```\n\n```arm\nmov r0, #1\n```')
    const pres = [...el.querySelectorAll('pre.shiki')]
    expect(pres.map((pre) => pre.querySelectorAll('.line span[style]').length > 1)).toEqual([true, true, true])
    expect(pres[1].outerHTML).toBe(pres[2].outerHTML)
  })
})

describe('table of contents', () => {
  test('lists headings with GitHub-style unique slugs', async () => {
    const { toc } = await renderMarkdown("# Title\n\n## What's New?\n\n### Using `mdv` *now*\n\n## What's New?\n")
    expect(toc).toEqual([
      { level: 1, text: 'Title', id: 'title' },
      { level: 2, text: "What's New?", id: 'whats-new' },
      { level: 3, text: 'Using mdv now', id: 'using-mdv-now' },
      { level: 2, text: "What's New?", id: 'whats-new-1' }
    ])
  })

  test('ids match the rendered headings', async () => {
    const source = '# Title\n\n## Location\n'
    const el = await dom(source)
    const { toc } = await renderMarkdown(source)
    expect([...el.querySelectorAll('h1, h2')].map((heading) => heading.id)).toEqual(toc.map((entry) => domId(entry.id)))
  })

  test('headings that would start with the id prefix still get ids of their own', async () => {
    const source = '# Policy\n\n## User content policy\n'
    const el = await dom(source)
    const { toc } = await renderMarkdown(source)
    expect(toc.map((entry) => entry.id)).toEqual(['policy', 'policy-1'])
    expect([...el.querySelectorAll('h1, h2')].map((heading) => heading.id)).toEqual(['user-content-policy', 'user-content-policy-1'])
  })

  test('keeps math and line breaks in the entry text', async () => {
    const { toc } = await renderMarkdown('## The $E=mc^2$ formula\n\nLine one\nline two\n========\n')
    expect(toc.map((entry) => entry.text)).toEqual(['The E=mc^2 formula', 'Line one line two'])
  })

  test('is empty without headings', async () => {
    expect((await renderMarkdown('just text')).toc).toEqual([])
  })
})

describe('sanitizing', () => {
  test('removes scripts, event handlers, styles and script URLs from raw HTML', async () => {
    const el = await dom(
      '<script>alert(1)</script>\n\n<img src="x.png" onerror="alert(1)">\n\n<style>body{display:none}</style>\n\n<a href="javascript:alert(1)">x</a>\n\n<iframe src="https://example.com"></iframe>\n'
    )
    expect(el.querySelector('script, style, iframe')).toBeNull()
    expect((await dom('<form action="https://example.com"><button>go</button></form>')).querySelector('form')).toBeNull()
    expect(el.querySelector('img')!.hasAttribute('onerror')).toBe(false)
    expect(el.querySelector('a')!.hasAttribute('href')).toBe(false)
  })

  test('keeps harmless raw HTML', async () => {
    const el = await dom('<details><summary>More</summary>\n\nhidden **text**\n\n</details>\n\n<kbd>Ctrl</kbd>\n')
    expect(el.querySelector('details summary')!.textContent).toBe('More')
    expect(el.querySelector('details strong')!.textContent).toBe('text')
    expect(el.querySelector('kbd')!.textContent).toBe('Ctrl')
  })
})
