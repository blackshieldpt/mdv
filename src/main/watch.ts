// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { basename } from 'path'
import { watch, type FSWatcher } from 'chokidar'
import { isIgnored, isMarkdown } from './tree'

// Watching is best effort: an unreadable folder or the system's watch limit must not stop the app.
const ignoreErrors = (): void => {}

/** Reports Markdown files and directories coming and going under `root`. */
export function watchFolder(root: string, onChange: () => void): FSWatcher {
  return watch(root, {
    ignoreInitial: true,
    // The file tree does not list symlinks, and a link may lead anywhere, even back into the folder.
    followSymlinks: false,
    ignored: (path, stats) => path !== root && (isIgnored(basename(path)) || (!!stats?.isFile() && !isMarkdown(path)))
  })
    .on('all', (event) => {
      if (event !== 'change') onChange()
    })
    .on('error', ignoreErrors)
}

/** Reports changes to individually added files, including a file that is deleted and comes back. */
export function watchFiles(onChange: (path: string) => void): FSWatcher {
  const watcher = watch([], { ignoreInitial: true })
  return watcher
    .on('all', (event, path) => {
      if (event === 'add' || event === 'change') onChange(path)
      // chokidar stops watching a deleted file; adding it again makes it wait for the name to return.
      else if (event === 'unlink') watcher.add(path)
    })
    .on('error', ignoreErrors)
}
