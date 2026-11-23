// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { mkdtempSync, readFileSync, rmSync } from 'fs'
import { createRequire } from 'module'
import { tmpdir } from 'os'
import { join } from 'path'
import type { Configuration } from 'electron-builder'
import { expect, test } from 'vitest'

// app-builder-lib comes with electron-builder and js-yaml with app-builder-lib, so neither is resolved from mdv.
const fromBuilder = createRequire(createRequire(import.meta.url).resolve('electron-builder'))
const fromLib = createRequire(fromBuilder.resolve('app-builder-lib'))

const config: Configuration = fromLib('js-yaml').load(readFileSync('electron-builder.yml', 'utf8'))

/** The shared-mime-info XML that electron-builder writes into the Linux packages for this configuration. */
async function linuxMimeXml(): Promise<string> {
  // Loading the package first settles its circular imports; platformPackager.js alone fails to load.
  fromLib('app-builder-lib')
  const { LinuxTargetHelper } = fromLib('app-builder-lib/out/targets/LinuxTargetHelper.js')
  const { PlatformPackager } = fromLib('app-builder-lib/out/platformPackager.js')
  const dir = mkdtempSync(join(tmpdir(), 'mdv-mime-'))
  try {
    const packager = {
      config,
      platformSpecificBuildOptions: config.linux,
      getTempFile: async (suffix: string) => join(dir, 'mime' + suffix)
    }
    Object.defineProperty(packager, 'fileAssociations', {
      get: Object.getOwnPropertyDescriptor(PlatformPackager.prototype, 'fileAssociations')?.get
    })
    return readFileSync(await new LinuxTargetHelper(packager).mimeTypeFiles, 'utf8')
  } finally {
    rmSync(dir, { recursive: true })
  }
}

test('#8 claim 1: every file association names one extension', () => {
  const associations = [config.fileAssociations ?? [], config.linux?.fileAssociations ?? []].flat()
  expect(associations.length).toBeGreaterThan(0)
  for (const { ext } of associations) expect(String(ext), JSON.stringify(ext)).toMatch(/^\w+$/)
})

test('#8 claim 2: the Linux MIME data has one glob per extension', async () => {
  const types = [...(await linuxMimeXml()).matchAll(/<mime-type type="([^"]*)">\s*<glob pattern="([^"]*)"/g)]
  expect(types.map(([, type, glob]) => `${glob} ${type}`).sort()).toEqual([
    '*.markdown text/markdown',
    '*.md text/markdown',
    '*.mdown text/markdown',
    '*.mdx text/mdx',
    '*.mkd text/markdown'
  ])
})

test('the mac config requests ad-hoc signing without the hardened runtime', () => {
  expect(config.mac?.identity).toBe('-')
  expect(config.mac?.hardenedRuntime).toBe(false)
  expect(config.mac?.sign).toBeUndefined()
  expect(config.mac?.signIgnore).toBeUndefined()
})

test('no loose files go into the macOS bundle, and the notices still ship everywhere', () => {
  const notices = [
    { from: 'LICENSE', to: 'LICENSE.mdv.txt' },
    { from: 'out/renderer/THIRD-PARTY-NOTICES.txt', to: 'THIRD-PARTY-NOTICES.txt' }
  ]
  expect(config.extraFiles ?? []).toEqual([])
  expect(config.mac?.extraFiles ?? []).toEqual([])
  expect(config.linux?.extraFiles).toEqual(notices)
  expect(config.win?.extraFiles).toEqual(notices)
  expect(config.mac?.extraResources).toEqual(expect.arrayContaining(notices))
})
