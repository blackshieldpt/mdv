// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

/**
 * Page numbers (1-based) of named link destinations in a PDF written by Chromium (0 for a name
 * the PDF does not define, such as the anchor of a heading that is not displayed). Chromium stores
 * objects uncompressed: the catalog names the page tree and a dictionary of destinations,
 * each destination being `/name [<page object> 0 R /XYZ x y zoom]`.
 *
 * Objects are located through the cross-reference table, never by searching the file: link URLs
 * and titles from the document are stored as plain strings and could imitate an object.
 */
export function destinationPages(pdf: Buffer, names: string[]): number[] {
  const text = pdf.toString('latin1')
  const tableAt = Number(/startxref\s+(\d+)\s+%%EOF\s*$/.exec(text)![1])
  const header = /xref\s+0 (\d+)\s+/y
  header.lastIndex = tableAt
  const count = Number(header.exec(text)![1])
  const entries = header.lastIndex
  const root = /trailer\s*<<[^]*?\/Root (\d+) 0 R/y
  root.lastIndex = entries + count * 20

  // Entries are 20 bytes each and start with the object's offset.
  const body = (id: string): string => {
    const object = /\d+ 0 obj\s*<<([^]*?)>>\s*endobj/y
    object.lastIndex = Number(text.slice(entries + Number(id) * 20, entries + Number(id) * 20 + 10))
    return object.exec(text)![1]
  }
  const reference = (dictionary: string, key: string): string => new RegExp(`/${key} (\\d+) 0 R`).exec(dictionary)![1]

  const pages = (id: string): string[] => {
    const node = body(id)
    if (!/\/Type\s*\/Pages\b/.test(node)) return [id]
    return [.../\/Kids\s*\[([^\]]*)\]/.exec(node)![1].matchAll(/(\d+) 0 R/g)].flatMap((kid) => pages(kid[1]))
  }

  const catalog = body(root.exec(text)![1])
  const order = pages(reference(catalog, 'Pages'))
  const dictionary = /\/Dests (\d+) 0 R/.exec(catalog)
  const destinations = dictionary ? body(dictionary[1]) : ''
  return names.map((name) => order.indexOf(new RegExp(`/${name} \\[(\\d+) 0 R`).exec(destinations)?.[1] ?? '') + 1)
}
