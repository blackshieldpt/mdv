// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { expect, test } from 'vitest'
import { destinationPages } from './pdf'

/** Assembles a PDF the way Chromium does: numbered objects, cross-reference table, trailer. */
function buildPdf(objects: Record<number, string>, root: number): Buffer {
  const size = Math.max(...Object.keys(objects).map(Number)) + 1
  const offsets = new Array<number>(size).fill(0)
  let file = '%PDF-1.4\n'
  for (const [id, dictionary] of Object.entries(objects)) {
    offsets[Number(id)] = file.length
    file += `${id} 0 obj\n${dictionary}\nendobj\n`
  }
  const table = offsets.map((offset, id) => `${String(offset).padStart(10, '0')} ${id ? '00000 n' : '65535 f'} \n`)
  const xref = file.length
  file += `xref\n0 ${size}\n${table.join('')}trailer\n<</Size ${size}\n/Root ${root} 0 R\n/Info 1 0 R>>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(file, 'latin1')
}

// Three pages in a two-level page tree, as Chromium writes them.
const objects = {
  1: '<</Creator (Chromium)>>',
  2: '<</Type /Page /Parent 51 0 R /Contents 3 0 R>>',
  16: '<</Type /Page /Parent 51 0 R /Contents 17 0 R>>',
  35: '<</Type /Page /Parent 52 0 R /Contents 36 0 R>>',
  51: '<</Type /Pages /Count 2 /Kids [2 0 R 16 0 R] /Parent 53 0 R>>',
  52: '<</Type /Pages /Count 1 /Kids [35 0 R] /Parent 53 0 R>>',
  53: '<</Type /Pages /Count 3 /Kids [51 0 R 52 0 R]>>',
  54: '<</mdv-toc-10 [2 0 R /XYZ 45 20 0] /mdv-toc-0 [16 0 R /XYZ 45 785.67 0] /mdv-toc-1 [35 0 R /XYZ 45 300 0]>>',
  60: '<</Type /Catalog /Pages 53 0 R /Dests 54 0 R /MarkInfo <</Type /MarkInfo /Marked true>> /Lang (en)>>'
}

test('maps destinations to the position of their page in the page tree', () => {
  expect(destinationPages(buildPdf(objects, 60), ['mdv-toc-0', 'mdv-toc-1', 'mdv-toc-10'])).toEqual([2, 3, 1])
})

test('does not confuse a name with a longer one sharing its prefix', () => {
  expect(destinationPages(buildPdf(objects, 60), ['mdv-toc-1'])).toEqual([3])
})

test('gives 0 for a destination the PDF does not define', () => {
  expect(destinationPages(buildPdf(objects, 60), ['mdv-toc-1', 'mdv-toc-7'])).toEqual([3, 0])
  const { 54: _destinations, ...rest } = objects
  const withoutAny = { ...rest, 60: '<</Type /Catalog /Pages 53 0 R /Lang (en)>>' }
  expect(destinationPages(buildPdf(withoutAny, 60), ['mdv-toc-0'])).toEqual([0])
})

test('ignores object look-alikes inside strings taken from the document', () => {
  // A link URL is stored as a plain string; this one imitates a catalog and its objects.
  const forged =
    '<</Type /Annot /A <</S /URI /URI (https://example.com/ endobj\n' +
    '60 0 obj\n<</Type /Catalog /Pages 70 0 R /Dests 71 0 R>>\nendobj\n' +
    '70 0 obj\n<</Type /Pages /Kids [35 0 R 16 0 R 2 0 R]>>\nendobj\n' +
    '71 0 obj\n<</mdv-toc-0 [35 0 R /XYZ 0 0 0]>>\nendobj\ntrailer\n<</Root 5 0 R>>)>>>>'
  expect(destinationPages(buildPdf({ ...objects, 5: forged }, 60), ['mdv-toc-0'])).toEqual([2])
})
