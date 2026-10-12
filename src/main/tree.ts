// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { readdir } from 'fs/promises'
import { basename, extname, join } from 'path'
import type { TreeNode } from '../shared/types'

export const MARKDOWN_EXT = ['md', 'markdown', 'mdown', 'mkd']

export function isMarkdown(path: string): boolean {
  return MARKDOWN_EXT.includes(extname(path).slice(1).toLowerCase())
}

export function isIgnored(name: string): boolean {
  return name.startsWith('.') || name === 'node_modules'
}

const byName = (a: TreeNode, b: TreeNode): number =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' })

/** Markdown files under `dir`, directories first; directories without any are pruned. */
export async function readTree(dir: string): Promise<TreeNode> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const dirs: TreeNode[] = []
  const files: TreeNode[] = []
  await Promise.all(
    entries.map(async (entry) => {
      if (isIgnored(entry.name)) return
      const path = join(dir, entry.name)
      if (entry.isDirectory()) {
        const node = await readTree(path)
        if (node.children!.length) dirs.push(node)
      } else if (entry.isFile() && isMarkdown(entry.name)) {
        files.push({ name: entry.name, path })
      }
    })
  )
  return { name: basename(dir), path: dir, children: [...dirs.sort(byName), ...files.sort(byName)] }
}
