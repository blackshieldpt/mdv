// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { memo, useEffect, useState } from 'react'
import type { TreeNode } from '../../shared/types'

interface Props {
  tree: TreeNode
  current: string | null
  onOpen(file: string): void
}

interface TreeProps extends Props {
  /** Reads the folder again, for changes the watch missed. */
  onRefresh(): void
}

function contains(node: TreeNode, file: string | null): boolean {
  return node.children ? node.children.some((child) => contains(child, file)) : node.path === file
}

function Node({ node, current, onOpen }: { node: TreeNode } & Omit<Props, 'tree'>) {
  const holdsCurrent = contains(node, current)
  const [open, setOpen] = useState(holdsCurrent)
  useEffect(() => {
    if (holdsCurrent) setOpen(true)
  }, [holdsCurrent])

  if (!node.children) {
    return (
      <li>
        <button className={node.path === current ? 'file active' : 'file'} title={node.name} onClick={() => onOpen(node.path)}>
          {node.name}
        </button>
      </li>
    )
  }
  return (
    <li>
      <button className="dir" aria-expanded={open} title={node.name} onClick={() => setOpen(!open)}>
        {node.name}
      </button>
      {open && (
        <ul>
          {node.children.map((child) => (
            <Node key={child.path} node={child} current={current} onOpen={onOpen} />
          ))}
        </ul>
      )}
    </li>
  )
}

export const FileTree = memo(function FileTree({ tree, current, onOpen, onRefresh }: TreeProps) {
  return (
    <nav className="tree">
      <div className="tree-head">
        <div className="pane-title" title={tree.path}>
          {tree.name}
        </div>
        <button className="tree-refresh" aria-label="Refresh file tree" title="Refresh" onClick={onRefresh}>
          ↻
        </button>
      </div>
      <ul>
        {tree.children!.map((child) => (
          <Node key={child.path} node={child} current={current} onOpen={onOpen} />
        ))}
      </ul>
    </nav>
  )
})
