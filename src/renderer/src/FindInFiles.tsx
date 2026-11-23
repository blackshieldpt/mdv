// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { useEffect, useRef, useState } from 'react'
import type { TreeNode } from '../../shared/types'
import { renderMarkdown, type Rendered } from './markdown'
import { findIn, searchText } from './search'

interface Props {
  /** Changes whenever the view is shown, to take the keyboard focus. */
  focus: number
  tree: TreeNode | null
  tabs: { file: string; doc: Rendered | null; failed: boolean }[]
  onOpen(file: string, query: string): void
  onClose(): void
}

interface Result {
  file: string
  count: number
  capped: boolean
  snippet: string
}

type Scope = 'open' | 'folder'

const files = (node: TreeNode): string[] => (node.children ? node.children.flatMap(files) : [node.path])

const basename = (path: string): string => path.split(/[\\/]/).pop()!

/** `folder` with one trailing separator, so a sibling such as `docs-old` is not taken for inside `docs`. */
const withSeparator = (folder: string): string => (/[\\/]$/.test(folder) ? folder : folder + (folder.includes('\\') ? '\\' : '/'))

export function FindInFiles({ focus, tree, tabs, onOpen, onClose }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [query, setQuery] = useState('')
  /** Null until the reader picks one: Folder whenever there is a folder, else open documents. */
  const [scope, setScope] = useState<Scope | null>(null)
  const [results, setResults] = useState<Result[]>([])
  /** The query the results are for, and whether the search for it is still running. */
  const [searched, setSearched] = useState<{ query: string; running: boolean } | null>(null)
  /** Bumped by every search, and on close, so that a superseded search stops. */
  const generation = useRef(0)
  const inScope: Scope = tree ? (scope ?? 'folder') : 'open'
  const prefix = tree && withSeparator(tree.path)

  useEffect(() => {
    input.current!.focus()
    input.current!.select()
  }, [focus])

  useEffect(
    () => () => {
      generation.current++
    },
    []
  )

  const pick = (next: Scope): void => {
    // Results from the other scope would show under this one.
    generation.current++
    setResults([])
    setSearched(null)
    setScope(next)
  }

  const search = async (): Promise<void> => {
    const id = ++generation.current
    const text = query
    setResults([])
    if (!text.trim()) {
      setSearched(null)
      return
    }
    setSearched({ query: text, running: true })
    const found = (file: string, doc: Rendered): void => {
      const result = findIn(searchText(doc.html), text)
      if (result.count) setResults((list) => [...list, { file, ...result }])
    }
    // A tab whose last read failed still holds the document it showed before.
    const readable = tabs.filter((tab) => !tab.failed)
    if (inScope === 'open') {
      for (const { file, doc } of readable) if (doc) found(file, doc)
    } else {
      for (const file of files(tree!)) {
        let doc = readable.find((tab) => tab.file === file)?.doc
        try {
          doc ??= await renderMarkdown(await window.mdv.readFile(file), /\.mdx$/i.test(file))
        } catch {
          // Deleted or unreadable since the tree was read.
        }
        if (id !== generation.current) return
        if (doc) found(file, doc)
        // Let the window handle input between files.
        await new Promise((resolve) => setTimeout(resolve))
        if (id !== generation.current) return
      }
    }
    setSearched({ query: text, running: false })
  }

  return (
    <div className="find-in-files" role="search">
      <div className="pane-title">Find in Files</div>
      <input
        ref={input}
        type="search"
        value={query}
        placeholder="Find in files"
        aria-label="Find in files"
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') search()
          else if (event.key === 'Escape') onClose()
        }}
      />
      <fieldset className="find-scope">
        <legend>Search in</legend>
        <label>
          <input type="radio" name="find-scope" checked={inScope === 'open'} onChange={() => pick('open')} />
          Open documents
        </label>
        <label>
          <input type="radio" name="find-scope" checked={inScope === 'folder'} disabled={!tree} onChange={() => pick('folder')} />
          Folder
        </label>
      </fieldset>
      {searched && (
        <ul>
          {results.map((result) => (
            <li key={result.file}>
              <button className="result" title={result.file} onClick={() => onOpen(result.file, searched.query)}>
                <span className="result-name">{basename(result.file)}</span>
                <span className="result-count">{result.count + (result.capped ? '+' : '')}</span>
                {prefix && result.file.startsWith(prefix) && (
                  <span className="result-path">{result.file.slice(prefix.length)}</span>
                )}
                <span className="result-snippet">{result.snippet}</span>
              </button>
            </li>
          ))}
          <li className="find-status" aria-live="polite">
            {searched.running ? 'Searching…' : !results.length && 'No results'}
          </li>
        </ul>
      )}
    </div>
  )
}
