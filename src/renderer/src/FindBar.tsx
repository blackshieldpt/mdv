// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState, type RefObject } from 'react'

interface Props {
  /** Changes whenever Find is invoked, to take the keyboard focus again. */
  focus: number
  /** Changes whenever the document's markup does. */
  version: number
  content: RefObject<HTMLElement | null>
  scroller: RefObject<HTMLElement | null>
  onClose(): void
}

/** Matches kept for one query; a single letter can occur hundreds of thousands of times. */
const LIMIT = 10000

/** Ranges of the visible occurrences of `query`, including ones spanning several elements. */
function findRanges(root: HTMLElement, query: string): Range[] {
  const nodes: Text[] = []
  const starts: number[] = []
  let text = ''
  const shown = new Map<Element, boolean>()
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const parent = node.parentElement!
    // KaTeX repeats every formula as visually hidden MathML.
    if (!shown.has(parent)) shown.set(parent, !parent.closest('style, .katex-mathml') && parent.checkVisibility())
    if (!shown.get(parent)) continue
    nodes.push(node)
    starts.push(text.length)
    text += node.data
  }

  // A space in the query matches any run of whitespace, such as a line break in the source.
  const pattern = new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'), 'gi')
  const nodeAt = (offset: number, from: number): number => {
    let index = from
    while (index + 1 < nodes.length && starts[index + 1] <= offset) index++
    return index
  }
  const ranges: Range[] = []
  let first = 0
  for (const match of text.matchAll(pattern)) {
    const end = match.index + match[0].length
    first = nodeAt(match.index, first)
    const last = nodeAt(end - 1, first)
    const range = document.createRange()
    range.setStart(nodes[first], match.index - starts[first])
    range.setEnd(nodes[last], end - starts[last])
    if (ranges.push(range) === LIMIT) break
  }
  return ranges
}

export function FindBar({ focus, version, content, scroller, onClose }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  const [ranges, setRanges] = useState<Range[]>([])
  const [current, setCurrent] = useState(0)
  const searched = useRef('')
  /** Whether the next highlight update should bring the current match into view. */
  const reveal = useRef(false)

  useEffect(() => {
    input.current!.focus()
    input.current!.select()
  }, [focus])

  useEffect(() => {
    const found = query.trim() ? findRanges(content.current!, query) : []
    setRanges(found)
    if (searched.current === query) {
      // The document changed under the same query: stay where the reader is.
      setCurrent((index) => Math.min(index, Math.max(0, found.length - 1)))
      return
    }
    // A new query starts from the first match at or below the top of the view, like a browser.
    searched.current = query
    reveal.current = true
    const top = scroller.current!.getBoundingClientRect().top
    setCurrent(Math.max(0, found.findIndex((range) => range.getBoundingClientRect().bottom >= top)))
  }, [query, version])

  useEffect(() => {
    const match = ranges[current]
    const all = new Highlight()
    for (const range of ranges) all.add(range)
    CSS.highlights.set('find', all)
    CSS.highlights.set('find-current', new Highlight(...(match ? [match] : [])))
    if (match && reveal.current) {
      const pane = scroller.current!
      const view = pane.getBoundingClientRect()
      const box = match.getBoundingClientRect()
      if (box.top < view.top || box.bottom > view.bottom) pane.scrollTop += box.top - view.top - pane.clientHeight / 3
    }
    reveal.current = false
    return () => {
      CSS.highlights.delete('find')
      CSS.highlights.delete('find-current')
    }
  }, [ranges, current])

  const step = (delta: number): void => {
    if (!ranges.length) return
    reveal.current = true
    setCurrent((current + delta + ranges.length) % ranges.length)
  }

  return (
    <div className="find" role="search">
      <input
        ref={input}
        value={query}
        placeholder="Find"
        aria-label="Find in document"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') step(event.shiftKey ? -1 : 1)
          else if (event.key === 'Escape') onClose()
        }}
      />
      <span className="find-count">
        {query.trim() && (ranges.length ? `${current + 1} / ${ranges.length}${ranges.length === LIMIT ? '+' : ''}` : 'No results')}
      </span>
      <button aria-label="Previous match" disabled={!ranges.length} onClick={() => step(-1)}>
        ↑
      </button>
      <button aria-label="Next match" disabled={!ranges.length} onClick={() => step(1)}>
        ↓
      </button>
      <button aria-label="Close find" onClick={onClose}>
        ×
      </button>
    </div>
  )
}
