// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

// @vitest-environment jsdom
import { describe, expect, test } from 'vitest'
import { renderMarkdown } from './markdown'
import { findIn, searchText } from './search'

/** What Find in Files reports for `query` in the Markdown `source`. */
async function find(source: string, query: string): Promise<ReturnType<typeof findIn>> {
  return findIn(searchText((await renderMarkdown(source)).html), query)
}

describe('find in files: the searched text (#20 claim 5)', () => {
  test('the content of a collapsed section is searched', async () => {
    expect((await find('<details><summary>More</summary>\n\nThe zebrafish hides here.\n\n</details>\n', 'zebrafish')).count).toBe(1)
  })

  test("a link's address is not searched, but an address shown as link text is", async () => {
    expect((await find('See [the site](https://example.com/zebrafish).\n', 'zebrafish')).count).toBe(0)
    expect((await find('See https://example.com/zebrafish now.\n', 'zebrafish')).count).toBe(1)
  })

  test('an element marked hidden is not searched', async () => {
    expect((await find('<p hidden>zebrafish</p>\n\nshown\n', 'zebrafish')).count).toBe(0)
  })

  test("KaTeX's hidden MathML copy is not counted again", async () => {
    expect((await find('A formula: $zebra$.\n', 'zebra')).count).toBe(1)
  })

  test('a Mermaid diagram is not searched', async () => {
    expect((await find('```mermaid\ngraph TD; zebrafish --> b\n```\n', 'zebrafish')).count).toBe(0)
  })

  test('front matter is not searched', async () => {
    expect((await find('---\ntitle: zebrafish\n---\n\n# Body\n', 'zebrafish')).count).toBe(0)
  })

  test('matching ignores case, and a space matches any run of whitespace', async () => {
    expect((await find('The Zebrafish\nswims  here.\n', 'zebrafish swims here')).count).toBe(1)
  })

  test('guard: text in ordinary blocks is found, once per occurrence', async () => {
    expect((await find('# Zebrafish\n\n- a zebrafish\n\n| zebrafish |\n|---|\n| zebrafish |\n', 'zebrafish')).count).toBe(4)
  })
})

describe('find in files: counts and snippets', () => {
  test('claim 7: counts stop at 10,000 and say so', async () => {
    const result = await find('x '.repeat(10001) + '\n', 'x')
    expect(result.count).toBe(10000)
    expect(result.capped).toBe(true)
  })

  test('claim 7 guard: a count under the cap is not marked capped', async () => {
    const result = await find('x '.repeat(9999) + '\n', 'x')
    expect(result.count).toBe(9999)
    expect(result.capped).toBe(false)
  })

  test('claim 8: the snippet is the block holding the first match, cut to 120 characters around it', async () => {
    const long = 'a'.repeat(200) + ' zebrafish ' + 'b'.repeat(200)
    const result = await find('First paragraph.\n\n' + long + '\n', 'zebrafish')
    expect(result.snippet).toContain('zebrafish')
    expect(result.snippet.length).toBeLessThanOrEqual(120)
    expect(result.snippet).not.toContain('First')
  })

  test('claim 8 guard: a short block is the whole snippet', async () => {
    expect((await find('Intro.\n\nThe zebrafish swims.\n', 'zebrafish')).snippet).toBe('The zebrafish swims.')
  })
})

describe('find in files: review round 1', () => {
  test('claim 7: exactly 10,000 matches show as capped, like the find bar', async () => {
    const result = await find('x '.repeat(10000) + '\n', 'x')
    expect(result.count).toBe(10000)
    expect(result.capped).toBe(true)
  })

  test('claim 8: a match does not span two blocks, so every counted match has a snippet', async () => {
    const result = await find('# Alpha\n\nA zebrafish.\n', 'alpha a')
    expect(result.count).toBe(0)
    expect((await find('# Alpha\n\nA zebrafish.\n', 'a zebrafish')).snippet).toBe('A zebrafish.')
  })
})
