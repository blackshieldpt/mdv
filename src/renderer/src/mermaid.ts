// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

const CACHE_LIMIT = 200
// Settings a diagram may not choose for itself: Mermaid's own list, plus those that put text of
// the diagram's choosing into the page's stylesheet, where it could react to the rest of the window.
const SECURE = [
  'secure',
  'securityLevel',
  'startOnLoad',
  'maxTextSize',
  'suppressErrorRendering',
  'maxEdges',
  'themeCSS',
  'themeVariables',
  'fontFamily',
  'altFontFamily'
]

/** Diagram source -> rendered markup holding a light and a dark variant. */
const cache = new Map<string, string>()
let sequence = 0
/** Runs wait for each other: Mermaid keeps the theme being rendered in one global setting. */
let queue = Promise.resolve()

function place(block: Element, html: string): void {
  const diagram = document.createElement('div')
  diagram.className = 'mermaid-diagram'
  // Mermaid output: sanitized by Mermaid itself under securityLevel 'strict'.
  diagram.innerHTML = html
  block.replaceWith(diagram)
}

/** Swaps in already rendered diagrams synchronously, so a reload does not flicker. */
export function placeCachedDiagrams(root: ParentNode): void {
  for (const block of root.querySelectorAll('pre.mermaid')) {
    const html = cache.get(block.textContent!)
    if (html) place(block, html)
  }
}

async function render(blocks: Element[]): Promise<void> {
  const { default: mermaid } = await import('mermaid')
  // Mermaid sizes nodes by measuring text, which needs the final font.
  await document.fonts.ready
  const fontFamily = getComputedStyle(document.documentElement).getPropertyValue('--font-ui')
  for (const block of blocks) {
    // The document was replaced while this run waited.
    if (!block.isConnected) return
    const source = block.textContent!
    try {
      if (!(await mermaid.parse(source, { suppressErrors: true }))) throw new Error('invalid diagram')
      let html = ''
      for (const theme of ['default', 'dark'] as const) {
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', secure: SECURE, theme, fontFamily })
        const { svg } = await mermaid.render(`mermaid-${sequence++}`, source)
        html += `<div class="mermaid-${theme}">${svg}</div>`
      }
      cache.set(source, html)
      if (cache.size > CACHE_LIMIT) cache.delete(cache.keys().next().value!)
      place(block, html)
    } catch {
      block.classList.add('mermaid-error')
    }
  }
}

export function renderDiagrams(root: ParentNode): Promise<void> {
  const blocks = [...root.querySelectorAll('pre.mermaid')]
  if (blocks.length) queue = queue.then(() => render(blocks))
  return queue
}
