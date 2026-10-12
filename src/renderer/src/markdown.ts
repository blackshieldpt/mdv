// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import MarkdownIt from 'markdown-it'
import anchor from 'markdown-it-anchor'
import deflist from 'markdown-it-deflist'
import frontMatter from 'markdown-it-front-matter'
import { full as emoji } from 'markdown-it-emoji'
import { alert } from '@mdit/plugin-alert'
import { footnote } from '@mdit/plugin-footnote'
import { katex } from '@mdit/plugin-katex'
import { tasklist } from '@mdit/plugin-tasklist'
import { slug } from 'github-slugger'
import { bundledLanguages, createHighlighter, type BundledLanguage } from 'shiki'
import DOMPurify from 'dompurify'
import { ID_PREFIX, type TocEntry } from '../../shared/types'

export interface Rendered {
  html: string
  toc: TocEntry[]
}

const THEMES = { light: 'github-light', dark: 'github-dark' }
const HEADING_TEXT = ['text', 'code_inline', 'emoji', 'math_inline']

const fenceLang = (info: string): string => info.trim().split(/\s+/)[0].toLowerCase()

const setup = (async () => {
  const shiki = await createHighlighter({ themes: Object.values(THEMES), langs: [] })
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

  const fence = md.renderer.rules.fence!
  md.renderer.rules.fence = (tokens, idx, options, env, self) =>
    fenceLang(tokens[idx].info) === 'mermaid'
      ? `<pre class="mermaid">${md.utils.escapeHtml(tokens[idx].content)}</pre>\n`
      : fence(tokens, idx, options, env, self)

  return { md, shiki }
})()

export async function renderMarkdown(source: string): Promise<Rendered> {
  const { md, shiki } = await setup
  const tokens = md.parse(source, {})

  const loaded = shiki.getLoadedLanguages()
  const langs = new Set(tokens.filter((token) => token.type === 'fence').map((token) => fenceLang(token.info)))
  await Promise.all(
    [...langs]
      .filter((lang) => Object.hasOwn(bundledLanguages, lang) && !loaded.includes(lang))
      .map((lang) => shiki.loadLanguage(lang as BundledLanguage))
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
