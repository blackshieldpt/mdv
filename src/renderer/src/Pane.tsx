// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { useState, type PointerEvent, type ReactNode } from 'react'

interface Props {
  side: 'left' | 'right'
  /** Names the pane in its button. */
  name: string
  defaultWidth: number
  open: boolean
  onToggle(): void
  children: ReactNode
}

const MIN_WIDTH = 140
const MAX_WIDTH = 640

/** A side pane that can be collapsed to a strip, and resized by dragging its inner edge. */
export function Pane({ side, name, defaultWidth, open, onToggle, children }: Props) {
  const storageKey = `mdv.paneWidth.${side}`
  const [width, setWidth] = useState(() => Number(localStorage.getItem(storageKey)) || defaultWidth)

  const widthAt = (event: PointerEvent<HTMLDivElement>): number => {
    const pane = event.currentTarget.parentElement!.getBoundingClientRect()
    const wanted = side === 'left' ? event.clientX - pane.left : pane.right - event.clientX
    return Math.round(Math.min(Math.max(wanted, MIN_WIDTH), MAX_WIDTH))
  }

  return (
    <aside className={`pane ${side}${open ? '' : ' collapsed'}`} style={open ? { width } : undefined}>
      <button className="pane-toggle" aria-label={`${open ? 'Collapse' : 'Expand'} ${name}`} onClick={onToggle}>
        {(side === 'left') === open ? '‹' : '›'}
      </button>
      {open && children}
      {open && (
        <div
          className="pane-resizer"
          onPointerDown={(event) => event.currentTarget.setPointerCapture(event.pointerId)}
          onPointerMove={(event) => event.currentTarget.hasPointerCapture(event.pointerId) && setWidth(widthAt(event))}
          // The release carries the final position; the last move may not have been rendered yet.
          onPointerUp={(event) => {
            setWidth(widthAt(event))
            localStorage.setItem(storageKey, String(widthAt(event)))
          }}
        />
      )}
    </aside>
  )
}
