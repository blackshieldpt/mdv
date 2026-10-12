// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import nodePath, { type PlatformPath } from 'path'
import type { LinkTarget } from '../shared/types'
import { decode } from '../shared/url'

const IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif', '.bmp', '.ico']

/**
 * Whether `target` is on the drive or share the document `base` lives on. A reference such as
 * `//host/share/x` resolves to another share, and merely looking at it would make Windows
 * authenticate against an arbitrary SMB server.
 */
function sameRoot(base: string, target: string, path: PlatformPath): boolean {
  return path.parse(target).root.toLowerCase() === path.parse(base).root.toLowerCase()
}

/** Resolves an image referenced by the document `base` to a local path, or null when it must not be served. */
export function resolveImage(base: string, src: string, path: PlatformPath = nodePath): string | null {
  const file = path.resolve(path.dirname(base), src)
  return sameRoot(base, file, path) && IMAGE_EXT.includes(path.extname(file).toLowerCase()) ? file : null
}

/** Resolves a link in the document `from` to a local path, or null when it must not be followed. */
export function resolveLink(from: string, href: string, path: PlatformPath = nodePath): LinkTarget | null {
  const [target, hash] = href.split('#')
  const file = path.resolve(path.dirname(from), decode(target.split('?')[0]))
  return sameRoot(from, file, path) ? { file, hash: hash ?? null } : null
}
