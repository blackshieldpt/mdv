// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'
import type { FSWatcher } from 'chokidar'
import { watchFiles, watchFolder } from './watch'

let dir: string
let watcher: FSWatcher

const ready = (target: FSWatcher): Promise<void> => new Promise((resolve) => target.once('ready', () => resolve()))
const pause = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'mdv-watch-'))
})

afterEach(async () => {
  await watcher.close()
  rmSync(dir, { recursive: true })
})

test('a folder watch does not follow symlinks out of the folder', async () => {
  mkdirSync(join(dir, 'docs/sub'), { recursive: true })
  mkdirSync(join(dir, 'outside/deep'), { recursive: true })
  symlinkSync(join(dir, 'outside'), join(dir, 'docs/link'))
  symlinkSync(join(dir, 'docs'), join(dir, 'docs/sub/loop'))
  watcher = watchFolder(join(dir, 'docs'), () => {})
  await ready(watcher)
  const watched = Object.keys(watcher.getWatched()).filter((path) => path.startsWith(join(dir, 'docs')))
  expect(watched.sort()).toEqual([join(dir, 'docs'), join(dir, 'docs/sub')])
})

test('a folder watch reports Markdown files and folders coming and going, not edits or other files', async () => {
  mkdirSync(join(dir, 'docs'))
  writeFileSync(join(dir, 'docs/a.md'), 'a')
  const changed = vi.fn()
  watcher = watchFolder(join(dir, 'docs'), changed)
  await ready(watcher)

  writeFileSync(join(dir, 'docs/a.md'), 'edited')
  writeFileSync(join(dir, 'docs/notes.txt'), 'x')
  await pause(300)
  expect(changed).not.toHaveBeenCalled()

  writeFileSync(join(dir, 'docs/b.md'), 'b')
  await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(1))
  rmSync(join(dir, 'docs/b.md'))
  await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(2))
})

test('a file watch survives the file being deleted and created again', async () => {
  mkdirSync(join(dir, 'one'))
  mkdirSync(join(dir, 'two'))
  const file = join(dir, 'one/a.md')
  writeFileSync(file, 'first')
  writeFileSync(join(dir, 'two/b.md'), 'other')
  const changed = vi.fn()
  watcher = watchFiles(changed)
  watcher.add([file, join(dir, 'two/b.md')])
  await pause(300)

  for (const round of [1, 2]) {
    rmSync(file)
    await pause(400)
    writeFileSync(file, `recreated ${round}`)
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(round * 2 - 1), { timeout: 3000 })
    await pause(300)
    writeFileSync(file, `edited ${round}`)
    await vi.waitFor(() => expect(changed).toHaveBeenCalledTimes(round * 2), { timeout: 3000 })
  }
  expect(changed).toHaveBeenLastCalledWith(file)
})
