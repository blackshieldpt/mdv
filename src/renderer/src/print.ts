// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import './styles'
import './styles/print.css'
import { domId, TOC_ANCHOR, type PrintJob } from '../../shared/types'
import { decode, EXTERNAL_LINK } from '../../shared/url'

const MARGIN_TEXT = 'font: 8.5pt var(--font-ui); color: var(--fg-muted);'
/** How long to wait for the document's images before printing without them. */
const IMAGE_TIMEOUT = 15000

const PAGE_WIDTH = { A4: '210mm', Letter: '8.5in' }
const MARGIN_X = '16mm'
/** A table is shrunk to fit the page down to this scale; past it, its words are broken as well. */
const TABLE_SCALE = 0.75
/** A URL, hash or similar: too long to keep on one line of a table cell. */
const LONG_WORD = /\S{25}/

function pageRule({ pageSize, title, options }: PrintJob): string {
  const header = options.fileName ? `@top-left { content: ${JSON.stringify(title)}; ${MARGIN_TEXT} }` : ''
  const footer = options.pageNumbers
    ? `@bottom-center { content: counter(page) " / " counter(pages); ${MARGIN_TEXT} }`
    : ''
  return `@page { size: ${pageSize}; margin: 20mm ${MARGIN_X}; ${header} ${footer} }`
}

/** Builds the contents page, and anchors each heading so its page can be looked up in the PDF. */
function contents({ toc, options }: PrintJob, article: HTMLElement): HTMLElement {
  const nav = document.createElement('nav')
  nav.className = options.pageNumbers ? 'print-toc' : 'print-toc plain'
  const title = document.createElement('p')
  title.className = 'print-toc-title'
  title.textContent = 'Contents'
  const top = Math.min(...toc.map((entry) => entry.level))
  const links = toc.map((entry, index) => {
    const anchor = document.createElement('a')
    anchor.id = TOC_ANCHOR + index
    // A heading inside markup the sanitizer dropped is listed but has no element.
    article.querySelector(`#${CSS.escape(entry.id)}`)?.prepend(anchor)

    const link = document.createElement('a')
    link.className = `level-${entry.level - top}`
    link.href = `#${anchor.id}`
    const text = document.createElement('span')
    text.textContent = entry.text
    link.append(text, document.createElement('i'), document.createElement('b'))
    return link
  })
  nav.append(title, ...links)
  return nav
}

/** Makes tables wider than the page fit it: paper cannot scroll. */
function fitTables(article: HTMLElement, pageSize: PrintJob['pageSize']): void {
  // Print lays the document out at the width of the page; measure at that width.
  article.style.width = `calc(${PAGE_WIDTH[pageSize]} - 2 * ${MARGIN_X})`
  for (const table of article.querySelectorAll('table')) {
    const fits = () => table.offsetWidth <= article.clientWidth
    if (fits()) continue
    for (const cell of table.querySelectorAll('th, td')) {
      if (LONG_WORD.test(cell.textContent)) cell.classList.add('breakable')
    }
    if (fits()) continue
    // Text does not shrink in exact proportion, so aim just under the width of the page.
    const scale = (0.99 * article.clientWidth) / table.offsetWidth
    table.style.zoom = String(Math.max(scale, TABLE_SCALE))
    if (scale < TABLE_SCALE) table.classList.add('breakable')
  }
  article.style.width = ''
}

async function prepare(): Promise<void> {
  const job = await window.mdv.printJob()
  document.title = job.title
  document.head.appendChild(document.createElement('style')).textContent = pageRule(job)

  const article = document.createElement('article')
  article.className = 'markdown'
  // Markup of the main window's document, sanitized there before it was rendered.
  article.innerHTML = job.html
  for (const link of article.querySelectorAll('a[href]')) {
    const href = link.getAttribute('href')!
    // In the main window a click maps a fragment to the prefixed id; here the link must name it.
    if (href.startsWith('#')) link.setAttribute('href', `#${domId(decode(href.slice(1)))}`)
    // Links to other documents would resolve against this window's own location.
    else if (!EXTERNAL_LINK.test(href)) link.removeAttribute('href')
  }
  const toc = job.options.toc && job.toc.length > 0 ? contents(job, article) : null
  if (toc) article.prepend(toc)
  document.body.append(article)

  const images = Promise.all([...article.querySelectorAll('img')].map((image) => image.decode().catch(() => {})))
  await Promise.race([images, new Promise((resolve) => setTimeout(resolve, IMAGE_TIMEOUT))])
  await document.fonts.ready
  fitTables(article, job.pageSize)

  if (toc && job.options.pageNumbers) {
    const pages = await window.mdv.printPages()
    toc.querySelectorAll('b').forEach((cell, index) => (cell.textContent = pages[index] ? String(pages[index]) : ''))
  }
}

prepare().then(
  () => window.mdv.printDone(),
  (error) => window.mdv.printDone(String(error))
)
