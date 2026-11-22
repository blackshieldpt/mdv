// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { existsSync, readdirSync, readFileSync } from 'fs'
import { join } from 'path'
import { describe, expect, test } from 'vitest'
import type { Component } from '../src/shared/types'
import { licenses } from './licenses'

function generate(): Record<string, string> {
  const files: Record<string, string> = {}
  const context = {
    getModuleIds: () => [][Symbol.iterator](),
    emitFile: ({ fileName, source }: { fileName: string; source: string }) => (files[fileName] = source)
  }
  ;(licenses().generateBundle as unknown as (this: typeof context) => void).call(context)
  return files
}

describe('vendored grammars (#5)', () => {
  const GRAMMARS = [
    ['https://github.com/dan-c-underwood/vscode-arm', 'Copyright (c) 2022 Dan Underwood'],
    ['https://github.com/Felipenguim/vscode-arm64-assembly', 'Copyright (c) 2026 vscode-arm64-assembly contributors'],
    ['https://github.com/mborik/z80-macroasm-vscode', 'Copyright (c) 2016 Imanol Barriuso (Imanolea)'],
    ['https://github.com/thinkyhead/AtariCode800', 'Copyright (c) 2026 Scott Lahteine'],
    [
      'https://github.com/jacksonriding/avr-asm-intellisense',
      'Copyright (c) 2026 AVR Assembly IntelliSense contributors'
    ]
  ]

  test('claim 9: notices and licenses.json list every vendored grammar with its licence', () => {
    const files = generate()
    const notices = files['THIRD-PARTY-NOTICES.txt']
    const { components } = JSON.parse(files['licenses.json']) as { components: Component[] }
    for (const [url, copyright] of GRAMMARS) {
      expect(notices, url).toContain(`Source: ${url}`)
      const component = components.find((c) => c.url === url)
      expect(component, url).toBeDefined()
      expect(component!.license).toBe('MIT')
      expect(component!.text).toContain(copyright)
      // The entry's own text: the block between the rule closing its header and the next entry's rule.
      expect(notices.slice(notices.indexOf(`Source: ${url}`)).split('='.repeat(80))[1]).toContain(copyright)
    }
  })

  test('claim 9: the notice for the patched 6502 grammar says what mdv changed', () => {
    const { components } = JSON.parse(generate()['licenses.json']) as { components: Component[] }
    const atari = components.find((c) => c.url === 'https://github.com/thinkyhead/AtariCode800')!
    expect(atari.text).toMatch(/^mdv .*comment\.line\.semicolon\.asm/)
  })

  test('claim 9: every grammar file in the source tree has a manifest entry and a licence', () => {
    const dir = 'src/renderer/src/grammars'
    const sources: { grammar: string; licenseFile: string }[] = JSON.parse(
      readFileSync(join(dir, 'sources.json'), 'utf8')
    )
    const files = readdirSync(dir).filter((file) => file.endsWith('.tmLanguage.json'))
    expect(files.length).toBeGreaterThan(0)
    expect(sources.map((source) => source.grammar).sort()).toEqual(files.sort())
    for (const source of sources) expect(existsSync(join(dir, source.licenseFile)), source.licenseFile).toBe(true)
  })

  test('guard: npm packages are still listed', () => {
    const { components } = JSON.parse(generate()['licenses.json']) as { components: Component[] }
    expect(components.some((c) => c.name === 'electron')).toBe(true)
  })
})
