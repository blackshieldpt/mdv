// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { posix, win32 } from 'path'
import { expect, test } from 'vitest'
import { resolveImage, resolveLink } from './paths'

test('resolves references against the document directory', () => {
  expect(resolveImage('/docs/guide/intro.md', 'img/a.png', posix)).toBe('/docs/guide/img/a.png')
  expect(resolveImage('/docs/guide/intro.md', '../logo.SVG', posix)).toBe('/docs/logo.SVG')
  expect(resolveImage('/docs/intro.md', '/srv/shared/a.jpg', posix)).toBe('/srv/shared/a.jpg')
  expect(resolveImage('C:\\docs\\intro.md', 'img\\a.png', win32)).toBe('C:\\docs\\img\\a.png')
  expect(resolveImage('C:\\docs\\intro.md', 'c:/other/a.png', win32)).toBe('c:\\other\\a.png')
})

test('serves images only', () => {
  expect(resolveImage('/docs/intro.md', '/etc/passwd', posix)).toBeNull()
  expect(resolveImage('/docs/intro.md', 'notes.md', posix)).toBeNull()
  expect(resolveImage('/docs/intro.md', 'a.png/../secret.txt', posix)).toBeNull()
})

test('refuses other drives and network shares on Windows', () => {
  expect(resolveImage('C:\\docs\\intro.md', '//attacker/share/a.png', win32)).toBeNull()
  expect(resolveImage('C:\\docs\\intro.md', '\\\\attacker\\share\\a.png', win32)).toBeNull()
  expect(resolveImage('C:\\docs\\intro.md', 'D:\\a.png', win32)).toBeNull()
  expect(resolveImage('\\\\nas\\docs\\intro.md', '//attacker/share/a.png', win32)).toBeNull()
})

test('allows images on the share the document lives on', () => {
  expect(resolveImage('\\\\nas\\docs\\guide\\intro.md', '../a.png', win32)).toBe('\\\\nas\\docs\\a.png')
})

test('resolves links against the document directory, with their fragment', () => {
  expect(resolveLink('/docs/guide/intro.md', '../README.md#tables', posix)).toEqual({ file: '/docs/README.md', hash: 'tables' })
  expect(resolveLink('/docs/intro.md', 'my%20notes.md?raw=1', posix)).toEqual({ file: '/docs/my notes.md', hash: null })
  expect(resolveLink('C:\\docs\\intro.md', 'guide/setup.md#', win32)).toEqual({ file: 'C:\\docs\\guide\\setup.md', hash: '' })
  expect(resolveLink('\\\\nas\\docs\\intro.md', 'guide/setup.md', win32)?.file).toBe('\\\\nas\\docs\\guide\\setup.md')
})

test('refuses links to other drives and network shares on Windows', () => {
  const from = 'C:\\docs\\intro.md'
  for (const href of ['//attacker/share/x.md', '\\\\attacker\\share\\x.md', '/\\attacker\\share\\x.md', '%5C%5Cattacker%5Cshare%5Cx.md', 'D%3A/x.md']) {
    expect(resolveLink(from, href, win32)).toBeNull()
  }
})
