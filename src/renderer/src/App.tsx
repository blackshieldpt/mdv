// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { domId, type PrintOptions, type TreeNode } from '../../shared/types'
import { About } from './About'
import { Document, type Anchor } from './Document'
import { FileTree } from './FileTree'
import { renderMarkdown, type Rendered } from './markdown'
import { Pane } from './Pane'
import { PrintDialog } from './PrintDialog'
import { Toc } from './Toc'

interface Tab {
  file: string
  /** Null while the file is being read, or when it could not be (`failed`). */
  doc: Rendered | null
  failed: boolean
  anchor: Anchor | null
}

interface State {
  root: string | null
  tree: TreeNode | null
  /** One tab per file; `active` is the file of the selected tab. */
  tabs: Tab[]
  active: string | null
  sidebar: boolean
  toc: boolean
  /** Files in the order they were shown; `cursor` is the place of the current one. */
  history: string[]
  cursor: number
}

type Action =
  | { type: 'root'; root: string; tree: TreeNode }
  | { type: 'open'; file: string; newTab: boolean; hash: string | null }
  | { type: 'loaded'; file: string; doc: Rendered }
  | { type: 'failed'; file: string }
  | { type: 'close'; file: string }
  | { type: 'cycle'; step: 1 | -1 }
  | { type: 'toggle'; pane: 'sidebar' | 'toc' }
  | { type: 'history'; step: 1 | -1 }

const initial: State = {
  root: null,
  tree: null,
  tabs: [],
  active: null,
  sidebar: true,
  toc: true,
  history: [],
  cursor: -1
}

const basename = (path: string): string => path.split(/[\\/]/).pop()!

function activate(state: State, file: string, hash: string | null = null): State {
  const anchor = hash === null ? null : { hash }
  return { ...state, active: file, tabs: state.tabs.map((tab) => (tab.file === file ? { ...tab, anchor } : tab)) }
}

function apply(state: State, action: Exclude<Action, { type: 'history' }>): State {
  const { tabs, active } = state
  const index = tabs.findIndex((tab) => tab.file === active)
  switch (action.type) {
    case 'root':
      return { ...state, root: action.root, tree: action.tree }
    case 'open': {
      if (tabs.some((tab) => tab.file === action.file)) return activate(state, action.file, action.hash)
      const tab: Tab = { file: action.file, doc: null, failed: false, anchor: action.hash === null ? null : { hash: action.hash } }
      const replace = !action.newTab && index >= 0
      return { ...state, active: tab.file, tabs: [...tabs.slice(0, replace ? index : index + 1), tab, ...tabs.slice(index + 1)] }
    }
    case 'loaded':
      return { ...state, tabs: tabs.map((tab) => (tab.file === action.file ? { ...tab, doc: action.doc, failed: false } : tab)) }
    case 'failed':
      return { ...state, tabs: tabs.map((tab) => (tab.file === action.file ? { ...tab, failed: true } : tab)) }
    case 'close': {
      const rest = tabs.filter((tab) => tab.file !== action.file)
      if (action.file !== active) return { ...state, tabs: rest }
      const next = rest[Math.min(index, rest.length - 1)]
      return next ? activate({ ...state, tabs: rest }, next.file) : { ...state, tabs: rest, active: null }
    }
    case 'cycle':
      return tabs.length ? activate(state, tabs[(index + action.step + tabs.length) % tabs.length].file) : state
    case 'toggle':
      return { ...state, [action.pane]: !state[action.pane] }
  }
}

function reducer(state: State, action: Action): State {
  if (action.type === 'history') {
    // Shows the file in its tab, or in the current tab if it is no longer open.
    const cursor = state.cursor + action.step
    const file = state.history[cursor]
    return file ? { ...apply(state, { type: 'open', file, newTab: false, hash: null }), cursor } : state
  }
  const next = apply(state, action)
  // Reopening the file the cursor is already on (after its tab was closed) is not a new step.
  if (!next.active || next.active === state.active || next.active === state.history[state.cursor]) return next
  return { ...next, history: [...state.history.slice(0, state.cursor + 1), next.active], cursor: state.cursor + 1 }
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initial)
  const [heading, setHeading] = useState<string | null>(null)
  const [about, setAbout] = useState(false)
  const [printing, setPrinting] = useState<'paper' | 'pdf' | null>(null)
  /** Zero while the find bar is closed; otherwise bumped each time Find is invoked. */
  const [find, setFind] = useState(0)
  const { tree, tabs, active } = state
  const tab = tabs.find((candidate) => candidate.file === active)

  const latest = useRef(state)
  latest.current = state
  /** Load counter per open file; a result is dropped when a newer load has started. */
  const loads = useRef(new Map<string, number>())

  const load = useCallback(async (file: string) => {
    const id = (loads.current.get(file) ?? 0) + 1
    loads.current.set(file, id)
    try {
      const doc = await renderMarkdown(await window.mdv.readFile(file))
      if (loads.current.get(file) === id) dispatch({ type: 'loaded', file, doc })
    } catch {
      // Deleted, unreadable, or not text; a later change to the file tries again.
      if (loads.current.get(file) === id) dispatch({ type: 'failed', file })
    }
  }, [])

  /** The folder whose tree is wanted; only the latest read of it is shown. */
  const wantedRoot = useRef<string | null>(null)
  const treeReads = useRef(0)
  const readTree = useCallback(async () => {
    const root = wantedRoot.current
    if (!root) return
    const id = ++treeReads.current
    const tree = await window.mdv.readTree(root)
    if (id === treeReads.current) dispatch({ type: 'root', root, tree })
  }, [])

  const openFile = useCallback((file: string, newTab: boolean, hash: string | null = null) => {
    dispatch({ type: 'open', file, newTab, hash })
  }, [])

  const openInNewTab = useCallback((file: string) => openFile(file, true), [])

  const followLink = useCallback(async (href: string, newTab: boolean) => {
    const target = await window.mdv.resolveLink(latest.current.active!, href)
    if (target) openFile(target.file, newTab, target.hash)
  }, [])

  const print = (options: PrintOptions): void => {
    const article = document.querySelector('.markdown')!.cloneNode(true) as HTMLElement
    // Paper has no way to expand a collapsed section.
    for (const details of article.querySelectorAll('details')) details.open = true
    window.mdv.print({
      pdf: printing === 'pdf',
      file: tab!.file,
      html: article.innerHTML,
      toc: tab!.doc!.toc.map((entry) => ({ ...entry, id: domId(entry.id) })),
      options
    })
  }

  const files = tabs.map((candidate) => candidate.file).join('\n')
  useEffect(() => {
    const open = files ? files.split('\n') : []
    window.mdv.watchFiles(open)
    for (const file of loads.current.keys()) if (!open.includes(file)) loads.current.delete(file)
    for (const file of open) if (!loads.current.has(file)) load(file)
  }, [files])

  useEffect(() => {
    document.title = active ? `${basename(active)} — mdv` : 'mdv'
  }, [active])

  // A print or find request belongs to the document it was made on.
  const shown = Boolean(tab?.doc)
  useEffect(() => {
    setPrinting(null)
    if (!shown) setFind(0)
  }, [active, shown])

  useEffect(() => {
    const unsubscribe = [
      window.mdv.onOpen(async ({ root, file }) => {
        if (file) openFile(file, true)
        if (root) {
          wantedRoot.current = root
          await readTree()
          window.mdv.watchRoot(root)
        }
      }),
      window.mdv.onMenu((action) => {
        const { active, tabs } = latest.current
        const shown = tabs.find((candidate) => candidate.file === active)?.doc
        if (action === 'print' || action === 'export-pdf') {
          if (shown) setPrinting(action === 'print' ? 'paper' : 'pdf')
        } else if (action === 'close-tab') {
          if (active) dispatch({ type: 'close', file: active })
          else window.close()
        } else if (action === 'next-tab') dispatch({ type: 'cycle', step: 1 })
        else if (action === 'prev-tab') dispatch({ type: 'cycle', step: -1 })
        else if (action === 'about') setAbout(true)
        else if (action === 'find') {
          if (shown) setFind((count) => count + 1)
        } else if (action === 'back') dispatch({ type: 'history', step: -1 })
        else if (action === 'forward') dispatch({ type: 'history', step: 1 })
        else dispatch({ type: 'toggle', pane: action === 'toggle-toc' ? 'toc' : 'sidebar' })
      }),
      window.mdv.onTreeChanged(readTree),
      window.mdv.onFileChanged((file) => {
        if (latest.current.tabs.some((candidate) => candidate.file === file)) load(file)
      })
    ]
    // The back and forward buttons of a mouse.
    const onMouseUp = (event: MouseEvent): void => {
      if (event.button === 3) dispatch({ type: 'history', step: -1 })
      else if (event.button === 4) dispatch({ type: 'history', step: 1 })
    }
    window.addEventListener('mouseup', onMouseUp)
    window.mdv.ready()
    return () => {
      unsubscribe.forEach((off) => off())
      window.removeEventListener('mouseup', onMouseUp)
    }
  }, [])

  return (
    <div
      className="app"
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault()
        for (const file of event.dataTransfer.files) window.mdv.open(file)
      }}
    >
      {tree && (
        <Pane
          side="left"
          name="file tree"
          defaultWidth={260}
          open={state.sidebar}
          onToggle={() => dispatch({ type: 'toggle', pane: 'sidebar' })}
        >
          <FileTree tree={tree} current={active} onOpen={openInNewTab} />
        </Pane>
      )}
      <main className="main">
        {tabs.length > 0 && (
          <div className="tabbar">
            <button
              className="history"
              aria-label="Back"
              disabled={state.cursor <= 0}
              onClick={() => dispatch({ type: 'history', step: -1 })}
            >
              ‹
            </button>
            <button
              className="history"
              aria-label="Forward"
              disabled={state.cursor >= state.history.length - 1}
              onClick={() => dispatch({ type: 'history', step: 1 })}
            >
              ›
            </button>
            <div className="tabs" role="tablist">
              {tabs.map(({ file }) => (
                <div
                  key={file}
                  role="tab"
                  aria-selected={file === active}
                  className={file === active ? 'tab active' : 'tab'}
                  title={file}
                  onClick={() => openFile(file, false)}
                  onAuxClick={(event) => event.button === 1 && dispatch({ type: 'close', file })}
                >
                  <span>{basename(file)}</span>
                  <button
                    aria-label="Close tab"
                    onClick={(event) => {
                      event.stopPropagation()
                      dispatch({ type: 'close', file })
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
        {tab?.doc ? (
          <Document
            file={tab.file}
            doc={tab.doc}
            anchor={tab.anchor}
            find={find}
            onFindClose={() => setFind(0)}
            onHeading={setHeading}
            onLink={followLink}
          />
        ) : tab?.failed ? (
          <div className="welcome">
            <p>{basename(tab.file)} cannot be read.</p>
          </div>
        ) : (
          !tab && (
            <div className="welcome">
              <h1>mdv</h1>
              <p>Open a Markdown file or folder, or drop one here.</p>
              <div>
                <button onClick={() => window.mdv.pick('file')}>Open File…</button>
                <button onClick={() => window.mdv.pick('folder')}>Open Folder…</button>
              </div>
            </div>
          )
        )}
      </main>
      {tab?.doc && tab.doc.toc.length > 0 && (
        <Pane
          side="right"
          name="table of contents"
          defaultWidth={240}
          open={state.toc}
          onToggle={() => dispatch({ type: 'toggle', pane: 'toc' })}
        >
          <Toc entries={tab.doc.toc} active={heading} onSelect={(id) => openFile(tab.file, false, id)} />
        </Pane>
      )}
      {about && <About onClose={() => setAbout(false)} />}
      {printing && tab?.doc && (
        <PrintDialog pdf={printing === 'pdf'} onPrint={print} onClose={() => setPrinting(null)} />
      )}
    </div>
  )
}
