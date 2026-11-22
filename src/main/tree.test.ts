// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { basename, join } from 'path'
import { afterAll, beforeAll, expect, test } from 'vitest'
import type { TreeNode } from '../shared/types'
import { isMarkdown, MARKDOWN_EXT, readTree } from './tree'

let root: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'mdv-tree-'))
  const files = [
    'b.md',
    'a.markdown',
    'File10.md',
    'file2.md',
    'notes.txt',
    '.hidden.md',
    'guide/intro.MD',
    'guide/deep/more.md',
    'assets/logo.png',
    'empty/sub/readme.txt',
    '.git/HEAD.md',
    'node_modules/pkg/README.md'
  ]
  for (const file of files) {
    mkdirSync(join(root, file, '..'), { recursive: true })
    writeFileSync(join(root, file), '')
  }
})

afterAll(() => rmSync(root, { recursive: true }))

const names = (node: TreeNode): unknown => (node.children ? [node.name, node.children.map(names)] : node.name)

test('lists markdown files, directories first, pruning directories without any', async () => {
  const tree = await readTree(root)
  expect(tree.path).toBe(root)
  expect(tree.children!.map(names)).toEqual([
    ['guide', [['deep', ['more.md']], 'intro.MD']],
    'a.markdown',
    'b.md',
    'file2.md',
    'File10.md'
  ])
})

test('gives absolute paths', async () => {
  const tree = await readTree(root)
  expect(tree.children![0].children![1].path).toBe(join(root, 'guide', 'intro.MD'))
})

test('returns an empty tree for an unreadable directory', async () => {
  expect((await readTree(join(root, 'missing'))).children).toEqual([])
})

test('recognises markdown extensions case-insensitively', () => {
  expect(isMarkdown('/x/README.MD')).toBe(true)
  expect(isMarkdown('/x/notes.mdown')).toBe(true)
  expect(isMarkdown('/x/notes.txt')).toBe(false)
  expect(isMarkdown('/x/md')).toBe(false)
})

test('#4 claim 1: recognises and lists MDX files', async () => {
  expect(isMarkdown('/x/doc.mdx')).toBe(true)
  expect(isMarkdown('/x/DOC.MDX')).toBe(true)
  expect(isMarkdown('/x/doc.mdxx')).toBe(false)
  const dir = mkdtempSync(join(tmpdir(), 'mdv-mdx-'))
  try {
    writeFileSync(join(dir, 'page.mdx'), '')
    writeFileSync(join(dir, 'page.jsx'), '')
    expect(names(await readTree(dir))).toEqual([basename(dir), ['page.mdx']])
  } finally {
    rmSync(dir, { recursive: true })
  }
})

test('#4 claim 4: the packages associate every extension mdv opens', () => {
  const entries = [...readFileSync('electron-builder.yml', 'utf8').matchAll(/^\s*- ext: (?:\[([^\]]*)\]|(\S+))$/gm)]
  const ext = entries.flatMap(([, list, one]) => (list ?? one).split(',').map((e) => e.trim()))
  expect(entries.some(([, , one]) => one === 'mdx')).toBe(true)
  expect([...ext].sort()).toEqual([...MARKDOWN_EXT].sort())
})
