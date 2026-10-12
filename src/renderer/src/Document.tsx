// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { domId } from '../../shared/types'
import { decode } from '../../shared/url'
import { FindBar } from './FindBar'
import { sanitize, type Rendered } from './markdown'
import { placeCachedDiagrams, renderDiagrams } from './mermaid'

/** A new object per navigation, so repeating the same hash scrolls again. */
export interface Anchor {
  hash: string
}

interface Props {
  file: string
  doc: Rendered
  anchor: Anchor | null
  /** Zero while the find bar is closed; otherwise changes each time Find is invoked. */
  find: number
  onFindClose(): void
  /** Reports the element id of the heading being read. */
  onHeading(id: string | null): void
  onLink(href: string, newTab: boolean): void
}

/** Last scroll offset per file; outlives the component so tabs resume where they were. */
const positions = new Map<string, number>()

export function Document({ file, doc, anchor, find, onFindClose, onHeading, onLink }: Props) {
  const scroller = useRef<HTMLDivElement>(null)
  const content = useRef<HTMLElement>(null)
  const shown = useRef<string | null>(null)
  /** Counts changes to the document's markup, which invalidate what the find bar found. */
  const [version, setVersion] = useState(0)

  const scrollTo = (hash: string): void => {
    const name = domId(decode(hash))
    const target = document.getElementById(name) ?? document.getElementsByName(name)[0]
    target?.scrollIntoView()
  }

  const spy = (): void => {
    const pane = scroller.current!
    const headings = content.current!.querySelectorAll('h1[id],h2[id],h3[id],h4[id],h5[id],h6[id]')
    const top = pane.getBoundingClientRect().top
    let active: Element | undefined
    for (const heading of headings) {
      if (heading.getBoundingClientRect().top - top > 24) break
      active = heading
    }
    if (pane.scrollTop > 0 && pane.scrollTop + pane.clientHeight >= pane.scrollHeight - 2) active = headings[headings.length - 1]
    onHeading(active ? active.id : null)
  }

  useEffect(() => {
    const fragment = sanitize(doc.html)
    for (const img of fragment.querySelectorAll('img[src]')) {
      const src = img.getAttribute('src')!
      if (!/^(https?:|data:)/i.test(src)) {
        img.setAttribute('src', `mdv-file://local/?base=${encodeURIComponent(file)}&src=${encodeURIComponent(src)}`)
      }
    }
    placeCachedDiagrams(fragment)
    content.current!.replaceChildren(fragment)

    const fresh = shown.current !== file
    shown.current = file
    if (fresh) scroller.current!.scrollTop = positions.get(file) ?? 0
    spy()
    setVersion((count) => count + 1)

    let stale = false
    renderDiagrams(content.current!).then(() => {
      if (stale) return
      if (fresh && anchor) scrollTo(anchor.hash)
      spy()
      setVersion((count) => count + 1)
    })
    return () => {
      stale = true
    }
  }, [file, doc])

  useEffect(() => {
    if (anchor) scrollTo(anchor.hash)
  }, [anchor])

  const onClick = (event: MouseEvent): void => {
    const link = (event.target as Element).closest('a')
    if (!link || event.button === 2) return
    event.preventDefault()
    const href = link.getAttribute('href')
    if (!href) return
    if (href.startsWith('#')) scrollTo(href.slice(1))
    else if (/^[a-z][a-z\d+.-]*:/i.test(href)) window.mdv.openExternal(href)
    else onLink(href, event.button === 1 || event.ctrlKey || event.metaKey)
  }

  return (
    <div className="doc">
      {find > 0 && <FindBar focus={find} version={version} content={content} scroller={scroller} onClose={onFindClose} />}
      <div
        className="doc-scroller"
        ref={scroller}
        onScroll={() => {
          positions.set(file, scroller.current!.scrollTop)
          spy()
        }}
      >
        <article className="markdown" ref={content} onClick={onClick} onAuxClick={onClick} />
      </div>
    </div>
  )
}
