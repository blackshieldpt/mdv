// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from 'react'
import type { PrintOptions } from '../../shared/types'

interface Props {
  pdf: boolean
  onPrint(options: PrintOptions): void
  onClose(): void
}

const STORAGE_KEY = 'mdv.printOptions'
const DEFAULTS: PrintOptions = { toc: false, pageNumbers: true, fileName: false }
const LABELS: [keyof PrintOptions, string][] = [
  ['toc', 'Table of contents'],
  ['pageNumbers', 'Page numbers'],
  ['fileName', 'File name']
]

export function PrintDialog({ pdf, onPrint, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null)
  const [options, setOptions] = useState<PrintOptions>(() => ({
    ...DEFAULTS,
    ...JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
  }))

  useEffect(() => dialog.current!.showModal(), [])

  return (
    <dialog className="print-dialog" ref={dialog} onClose={onClose}>
      <form
        method="dialog"
        onSubmit={() => {
          localStorage.setItem(STORAGE_KEY, JSON.stringify(options))
          onPrint(options)
        }}
      >
        <h1>{pdf ? 'Export as PDF' : 'Print'}</h1>
        {LABELS.map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={options[key]}
              onChange={() => setOptions({ ...options, [key]: !options[key] })}
            />
            {label}
          </label>
        ))}
        <footer>
          <button type="button" onClick={() => dialog.current!.close()}>
            Cancel
          </button>
          <button type="submit" className="primary">
            {pdf ? 'Export…' : 'Print…'}
          </button>
        </footer>
      </form>
    </dialog>
  )
}
