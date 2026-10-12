// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

export interface TreeNode {
  name: string
  path: string
  /** Present on directories only. */
  children?: TreeNode[]
}

export interface OpenTarget {
  root?: string
  file?: string
}

export interface LinkTarget {
  file: string
  hash: string | null
}

export interface TocEntry {
  level: number
  text: string
  id: string
}

export interface PrintOptions {
  toc: boolean
  pageNumbers: boolean
  fileName: boolean
}

interface PrintContent {
  /** Sanitized document markup, as shown in the main window. */
  html: string
  /** Headings for the contents page; `id` is the id of the heading element. */
  toc: TocEntry[]
  options: PrintOptions
}

export interface PrintRequest extends PrintContent {
  pdf: boolean
  file: string
}

export interface PrintJob extends PrintContent {
  title: string
  pageSize: 'A4' | 'Letter'
}

export interface Component {
  name: string
  version: string
  /** SPDX identifier as declared by the package. */
  license: string
  url: string | null
  text: string | null
}

export interface AboutInfo {
  version: string
  versions: { electron: string; chrome: string; node: string; v8: string }
  /** License text of mdv itself. */
  license: string
  components: Component[]
}

export type MenuAction =
  | 'about'
  | 'find'
  | 'back'
  | 'forward'
  | 'print'
  | 'export-pdf'
  | 'toggle-sidebar'
  | 'toggle-toc'
  | 'close-tab'
  | 'next-tab'
  | 'prev-tab'

export interface MdvApi {
  /** Tells the main process the renderer can receive `onOpen` events. */
  ready(): Promise<void>
  pick(kind: 'file' | 'folder'): Promise<void>
  open(file: File): Promise<void>
  readTree(root: string): Promise<TreeNode>
  readFile(path: string): Promise<string>
  resolveLink(from: string, href: string): Promise<LinkTarget | null>
  watchRoot(root: string): Promise<void>
  watchFiles(files: string[]): Promise<void>
  openExternal(url: string): Promise<void>
  print(request: PrintRequest): Promise<void>
  /** For the print window: the job to lay out, and the report that it is ready (or failed). */
  printJob(): Promise<PrintJob>
  printDone(error?: string): Promise<void>
  /** For the print window: the page each contents entry is printed on, 0 if it is not printed. */
  printPages(): Promise<number[]>
  about(): Promise<AboutInfo>
  /** Opens the license list of Chromium and the other software bundled with Electron. */
  openChromiumLicenses(): Promise<void>
  onOpen(listener: (target: OpenTarget) => void): () => void
  onMenu(listener: (action: MenuAction) => void): () => void
  onTreeChanged(listener: () => void): () => void
  onFileChanged(listener: (path: string) => void): () => void
}

/** Id prefix of the anchors the print window puts on headings, numbered like the contents entries. */
export const TOC_ANCHOR = 'mdv-toc-'

/** Prefix the sanitizer puts on every id, so document content cannot clobber DOM globals. */
export const ID_PREFIX = 'user-content-'

/** The id an element has in the document for a heading slug or link fragment. */
export function domId(slug: string): string {
  // The sanitizer leaves an id alone when it already starts with the prefix.
  return slug.startsWith(ID_PREFIX) ? slug : ID_PREFIX + slug
}
