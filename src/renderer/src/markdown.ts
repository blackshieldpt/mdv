// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { Parser, type Program } from 'acorn'
import jsx from 'acorn-jsx'
import MarkdownIt, { type StateBlock } from 'markdown-it'
import anchor from 'markdown-it-anchor'
import deflist from 'markdown-it-deflist'
import frontMatter from 'markdown-it-front-matter'
import { full as emoji } from 'markdown-it-emoji'
import { alert } from '@mdit/plugin-alert'
import { footnote } from '@mdit/plugin-footnote'
import { katex } from '@mdit/plugin-katex'
import { tasklist } from '@mdit/plugin-tasklist'
import { slug } from 'github-slugger'
import { bundledLanguages, createHighlighter, type BundledLanguage, type LanguageRegistration } from 'shiki'
import DOMPurify from 'dompurify'
import { ID_PREFIX, type TocEntry } from '../../shared/types'

export interface Rendered {
  html: string
  toc: TocEntry[]
}

const THEMES = { light: 'github-light', dark: 'github-dark' }
const HEADING_TEXT = ['text', 'code_inline', 'emoji', 'math_inline']

const fenceLang = (info: string): string => info.trim().split(/\s+/)[0].toLowerCase()

/** Names for x86 assembly that Shiki's bundled grammar does not answer to. */
const LANG_ALIAS: Record<string, string> = { nasm: 'asm', x86asm: 'asm', masm: 'asm', gas: 'asm', s: 'asm' }

/** Grammars Shiki does not bundle, copied into ./grammars (see sources.json there) and loaded on first use. */
const GRAMMARS = [
  { name: 'arm', aliases: ['armasm'], load: () => import('./grammars/arm.tmLanguage.json') },
  { name: 'arm64', aliases: ['aarch64'], load: () => import('./grammars/arm64.tmLanguage.json') },
  { name: 'z80', aliases: [], load: () => import('./grammars/z80.tmLanguage.json') },
  { name: '6502', aliases: ['65c02'], load: () => import('./grammars/6502.tmLanguage.json') },
  { name: 'avr', aliases: [], load: () => import('./grammars/avr.tmLanguage.json') }
]
const vendored = new Map(
  GRAMMARS.flatMap((grammar) => [grammar.name, ...grammar.aliases].map((name) => [name, grammar]))
)

type RuleBlock = (state: StateBlock, startLine: number, endLine: number, silent: boolean) => boolean

const ESM_START = /^(?:import|export)\s/
/** How many shorter runs of lines are tried when a block does not parse as a whole. */
const PREFIX_TRIES = 20
/** How many blank-line-separated blocks one statement may span; each one re-parses it. */
const STATEMENT_BLOCKS = 50
const JsParser = Parser.extend(jsx())

/** `yes` for code made only of import and export statements, `more` when it ends too early. */
function moduleCode(code: string): 'yes' | 'more' | 'no' {
  try {
    const { body } = JsParser.parse(code, { ecmaVersion: 'latest', sourceType: 'module' }) as Program
    return body.every((node) => node.type === 'ImportDeclaration' || node.type.startsWith('Export')) ? 'yes' : 'no'
  } catch (error) {
    // As MDX decides it: an error raised at the end, or a comment left open, means the code goes on.
    const { raisedAt, message } = error as { raisedAt?: number; message?: string }
    return (raisedAt ?? 0) >= code.length || message?.startsWith('Unterminated comment') ? 'more' : 'no'
  }
}

/**
 * MDX: a top-level `import` or `export` statement is module code rather than content, so it
 * renders as nothing; MDX code is never run. Like MDX, it takes the lines up to a blank line and
 * goes on past blank lines while what it has is an unfinished statement; anything that does not
 * parse as statements is left as text.
 */
const mdxEsm: RuleBlock = (state, startLine, endLine) => {
  // From the line's first column, so an indented line never starts a statement.
  const first = state.src.slice(state.bMarks[startLine], state.eMarks[startLine])
  if (state.level !== 0 || !ESM_START.test(first)) return false
  const code = (end: number): string => state.src.slice(state.bMarks[startLine], state.eMarks[end - 1])
  let line = startLine
  while (line < endLine && !state.isEmpty(line)) line++
  const firstEnd = line
  for (let blocks = 1; ; blocks++) {
    const verdict = moduleCode(code(line))
    if (verdict === 'yes') break
    if (verdict === 'no' || line >= endLine || blocks >= STATEMENT_BLOCKS) {
      // Lines that are not code may follow the statements without a blank line (`---`, `: term`).
      const stop = Math.max(startLine, firstEnd - 1 - PREFIX_TRIES)
      for (line = firstEnd - 1; line > stop && moduleCode(code(line)) !== 'yes'; line--);
      if (line === stop) return false
      break
    }
    while (line < endLine && state.isEmpty(line)) line++
    while (line < endLine && !state.isEmpty(line)) line++
  }
  state.line = line
  return true
}

const setup = (async () => {
  const shiki = await createHighlighter({ themes: Object.values(THEMES), langs: [], langAlias: LANG_ALIAS })
  const create = (mdx: boolean) => {
    const md = new MarkdownIt({
      html: true,
      linkify: true,
      highlight: (code, lang) =>
        shiki.codeToHtml(code.replace(/\n$/, ''), {
          lang: shiki.getLoadedLanguages().includes(lang.toLowerCase()) ? lang.toLowerCase() : 'text',
          themes: THEMES,
          defaultColor: false
        })
    })
      // A slug that began with the id prefix would end up sharing its element id with another heading.
      .use(anchor, { slugify: (text) => slug(text).replace(new RegExp(`^(${ID_PREFIX})+`), ''), tabIndex: false })
      .use(deflist)
      .use(frontMatter, () => {})
      .use(emoji)
      .use(alert)
      .use(footnote)
      .use(tasklist)
      .use(katex, { mathFence: true, throwOnError: false, maxSize: 500 })

    // Right after front matter, so a setext underline or a definition cannot claim the statement.
    if (mdx) md.block.ruler.before('table', 'mdx_esm', mdxEsm)

    const fence = md.renderer.rules.fence!
    md.renderer.rules.fence = (tokens, idx, options, env, self) =>
      fenceLang(tokens[idx].info) === 'mermaid'
        ? `<pre class="mermaid">${md.utils.escapeHtml(tokens[idx].content)}</pre>\n`
        : fence(tokens, idx, options, env, self)
    return md
  }

  return { markdown: create(false), mdx: create(true), shiki }
})()

/** Renders a document, as MDX when `mdx` is set. */
export async function renderMarkdown(source: string, mdx = false): Promise<Rendered> {
  const { markdown, mdx: mdxParser, shiki } = await setup
  const md = mdx ? mdxParser : markdown
  // MDX ignores a byte order mark, which would otherwise hide a first-line statement.
  if (mdx) source = source.replace(/^\uFEFF/, '')
  const tokens = md.parse(source, {})

  const loaded = shiki.getLoadedLanguages()
  // An alias counts as loaded as soon as it is declared, so it is resolved before that check. The
  // info is unescaped as markdown-it does before calling `highlight`, so both see the same name.
  const langs = new Set(
    tokens
      .filter((token) => token.type === 'fence')
      .map((token) => fenceLang(md.utils.unescapeAll(token.info)))
      .map((lang) => (Object.hasOwn(LANG_ALIAS, lang) ? LANG_ALIAS[lang] : lang))
  )
  await Promise.all(
    [...langs]
      .filter((lang) => !loaded.includes(lang))
      .map(async (lang) => {
        if (Object.hasOwn(bundledLanguages, lang)) return shiki.loadLanguage(lang as BundledLanguage)
        const grammar = vendored.get(lang)
        if (!grammar) return
        const rules = (await grammar.load()).default as unknown as LanguageRegistration
        await shiki.loadLanguage({ ...rules, name: grammar.name, aliases: grammar.aliases })
      })
  )

  const toc = tokens.flatMap((token, i) =>
    token.type === 'heading_open'
      ? [
          {
            level: Number(token.tag[1]),
            id: String(token.attrGet('id')),
            text: tokens[i + 1]
              .children!.filter((child) => child.type === 'softbreak' || HEADING_TEXT.includes(child.type))
              .map((child) => child.content || ' ')
              .join('')
          }
        ]
      : []
  )
  // Through `md.render`, not the tokens above: it is what resets the KaTeX macros a document
  // defined, which would otherwise carry over into every document rendered after it.
  return { html: md.render(source), toc }
}

export function sanitize(html: string): DocumentFragment {
  return DOMPurify.sanitize(html, {
    RETURN_DOM_FRAGMENT: true,
    SANITIZE_NAMED_PROPS: true,
    // A document must not restyle the application, nor submit forms from its window.
    FORBID_TAGS: ['style', 'form'],
    // KaTeX keeps the TeX source in <annotation> for accessibility and copy/paste.
    ADD_TAGS: ['semantics', 'annotation']
  })
}
