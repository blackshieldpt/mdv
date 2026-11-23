// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { sanitize } from './markdown'

/** Matches counted for one query, as in the find bar; a single letter can occur hundreds of thousands of times. */
export const LIMIT = 10000

/** A Find query as a pattern: case-insensitive, with a space matching any run of whitespace. */
export function queryPattern(query: string): RegExp {
  return new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'gi')
}

const BLOCK = 'p, h1, h2, h3, h4, h5, h6, li, dt, dd, td, th, pre, summary, caption, figcaption'
// KaTeX repeats every formula as visually hidden MathML; diagrams are drawn only on screen.
const SKIPPED = '[hidden], .katex-mathml, pre.mermaid'

/** The text of rendered HTML as Find in Files searches it, one string per block. */
export function searchText(html: string): string[] {
  const blocks: string[] = []
  let owner: Element | null | undefined
  const walker = document.createTreeWalker(sanitize(html), NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement
    if (!parent || parent.closest(SKIPPED)) continue
    const block = parent.closest(BLOCK)
    if (block !== owner || !blocks.length) blocks.push('')
    owner = block
    blocks[blocks.length - 1] += node.data
  }
  return blocks.map((text) => text.replace(/\s+/g, ' ').trim()).filter(Boolean)
}

export interface Found {
  /** Matches, up to LIMIT. */
  count: number
  /** Whether the count stopped at LIMIT, shown as "10000+" like the find bar. */
  capped: boolean
  /** Up to SNIPPET characters of the block holding the first match. */
  snippet: string
}

const SNIPPET = 120

export function findIn(blocks: string[], query: string): Found {
  if (!query.trim()) return { count: 0, capped: false, snippet: '' }
  // Counted block by block, so every match has a block to show as its snippet.
  const pattern = queryPattern(query)
  let count = 0
  let snippet = ''
  for (const block of blocks) {
    for (const match of block.matchAll(pattern)) {
      if (!count) {
        const start = Math.max(0, Math.min(match.index - Math.floor((SNIPPET - match[0].length) / 2), block.length - SNIPPET))
        snippet = block.slice(start, start + SNIPPET)
      }
      if (++count === LIMIT) return { count, capped: true, snippet }
    }
  }
  return { count, capped: false, snippet }
}
