// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

// @vitest-environment jsdom
import { expect, test, vi } from 'vitest'
import { renderMarkdown, sanitize } from './markdown'

// Highlighting a fence that holds this word throws, as a grammar that overflows the stack does.
vi.mock('shiki', async (importOriginal) => {
  const shiki = await importOriginal<typeof import('shiki')>()
  const createHighlighter: typeof shiki.createHighlighter = async (options) => {
    const highlighter = await shiki.createHighlighter(options)
    const codeToHtml = highlighter.codeToHtml.bind(highlighter)
    highlighter.codeToHtml = (code, opts) => {
      if (code.includes('highlighting_fault')) throw new RangeError('Maximum call stack size exceeded')
      return codeToHtml(code, opts)
    }
    return highlighter
  }
  return { ...shiki, createHighlighter }
})

test('#10 claim 3: a fence whose highlighting throws is shown as plain text, and the others are still highlighted', async () => {
  const source = '```ts\nconst a = 1\n```\n\n```ts\nconst highlighting_fault = 2\n```\n\n```ts\nconst b = 3\n```'
  const html = await renderMarkdown(source).then(
    (rendered) => rendered.html,
    (error: Error) => error
  )
  expect(html, 'the document renders').not.toBeInstanceOf(Error)
  const container = document.createElement('div')
  container.append(sanitize(html as string))
  const [before, failed, after] = container.querySelectorAll('pre')
  expect(before.querySelectorAll('.line span[style]').length).toBeGreaterThan(1)
  expect(after.querySelectorAll('.line span[style]').length).toBeGreaterThan(1)
  expect(failed.textContent).toContain('const highlighting_fault = 2')
  expect(failed.classList.contains('shiki'), 'the failed fence is plain').toBe(false)
})
