// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join, resolve } from 'path'
import type { Plugin } from 'vite'
import type { Component } from '../src/shared/types'

/** Captures the directory of the innermost package a module path belongs to. */
const PACKAGE_DIR = /^(.*[\\/]node_modules[\\/](?:@[^\\/]+[\\/])?[^\\/]+)/
const LICENSE_FILE = /^(?:(?:un)?licen[sc]e|copying|notice)(?:-\w+)?(?:\.(?:md|txt))?$/i
const RULE = '='.repeat(80)

function sourceUrl(manifest: { repository?: string | { url?: string }; homepage?: string }): string | null {
  const repository = typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url
  if (!repository) return manifest.homepage ?? null
  if (/^[\w.-]+\/[\w.-]+$/.test(repository)) return `https://github.com/${repository}`
  return repository
    .replace(/^git\+/, '')
    .replace(/^git:\/\//, 'https://')
    .replace(/^(git@github\.com:|github:)/, 'https://github.com/')
    .replace(/\.git$/, '')
}

function describe(dir: string): Component {
  const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
  const license = manifest.license?.type ?? manifest.license
  const texts = readdirSync(dir)
    .filter((file) => LICENSE_FILE.test(file))
    .sort()
    .map((file) => readFileSync(join(dir, file), 'utf8').trim())
  return {
    name: manifest.name,
    version: manifest.version,
    license: license ?? 'See license text',
    url: sourceUrl(manifest),
    text: texts.join('\n\n') || null
  }
}

function notices(components: Component[]): string {
  const entries = components.map((component) =>
    [
      RULE,
      `${component.name} ${component.version}`,
      `License: ${component.license}`,
      ...(component.url ? [`Source: ${component.url}`] : []),
      RULE,
      '',
      component.text ?? 'This package does not include a license text.',
      ''
    ].join('\n')
  )
  return [
    'Third-party software in mdv',
    '',
    'mdv includes the components listed below, each under its own license. Chromium, Node.js and',
    'the other software bundled with Electron are covered by LICENSES.chromium.html.',
    '',
    'The syntax grammars and color themes inside the Shiki packages come from many projects, each',
    'under its own license; they are listed at https://github.com/shikijs/textmate-grammars-themes.',
    '',
    ...entries
  ].join('\n')
}

/**
 * Emits `licenses.json` (read by the About dialog) and `THIRD-PARTY-NOTICES.txt` (shipped with the
 * packages), covering every package bundled into the renderer, the production dependencies of the
 * main process, and Electron itself.
 */
export function licenses(): Plugin {
  return {
    name: 'mdv-licenses',
    apply: 'build',
    generateBundle() {
      const dirs = new Set([resolve('node_modules/electron')])
      for (const id of this.getModuleIds()) {
        const match = PACKAGE_DIR.exec(id.replace(/^\0/, ''))
        if (match) dirs.add(match[1])
      }
      const lock = JSON.parse(readFileSync('package-lock.json', 'utf8'))
      for (const [path, info] of Object.entries<{ dev?: boolean }>(lock.packages)) {
        if (path && !info.dev && existsSync(path)) dirs.add(resolve(path))
      }

      const byId = new Map<string, Component>()
      for (const dir of dirs) {
        const component = describe(dir)
        byId.set(`${component.name}@${component.version}`, component)
      }
      const components = [...byId.values()].sort((a, b) => a.name.localeCompare(b.name))

      const license = readFileSync('LICENSE', 'utf8')
      this.emitFile({ type: 'asset', fileName: 'licenses.json', source: JSON.stringify({ license, components }) })
      this.emitFile({ type: 'asset', fileName: 'THIRD-PARTY-NOTICES.txt', source: notices(components) })
    }
  }
}
