// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef } from 'react'
import { domId, type TocEntry } from '../../shared/types'

interface Props {
  entries: TocEntry[]
  /** Element id of the heading being read. */
  active: string | null
  onSelect(id: string): void
}

export function Toc({ entries, active, onSelect }: Props) {
  const nav = useRef<HTMLElement>(null)
  const top = Math.min(...entries.map((entry) => entry.level))

  useEffect(() => {
    nav.current!.querySelector('.active')?.scrollIntoView({ block: 'nearest' })
  }, [active])

  return (
    <nav className="toc" ref={nav}>
      <div className="pane-title">Contents</div>
      <ul>
        {entries.map((entry) => (
          <li key={entry.id}>
            <button
              className={domId(entry.id) === active ? 'active' : undefined}
              style={{ paddingLeft: 10 + (entry.level - top) * 12 }}
              title={entry.text}
              onClick={() => onSelect(entry.id)}
            >
              {entry.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
