// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  nativeTheme,
  net,
  protocol,
  shell,
  type MenuItemConstructorOptions
} from 'electron'
import { readdir, readFile, stat, writeFile } from 'fs/promises'
import { basename, dirname, extname, join, resolve, sep } from 'path'
import { pathToFileURL } from 'url'
import type { FSWatcher } from 'chokidar'
import {
  TOC_ANCHOR,
  type AboutInfo,
  type LinkTarget,
  type MenuAction,
  type OpenTarget,
  type PrintJob,
  type PrintRequest,
  type TreeNode
} from '../shared/types'
import { decode, EXTERNAL_LINK } from '../shared/url'
import icon from '../../build/icon.png?asset'
import { resolveImage, resolveLink } from './paths'
import { destinationPages } from './pdf'
import { isMarkdown, MARKDOWN_EXT, readTree } from './tree'
import { watchFiles, watchFolder } from './watch'

const LETTER_COUNTRIES = ['US', 'CA', 'MX']
const README = new RegExp(`^readme\\.(${MARKDOWN_EXT.join('|')})$`, 'i')
const RENDERER = join(__dirname, '../renderer')
const isMac = process.platform === 'darwin'

let win: BrowserWindow | null = null
let rendererReady = false
/** Paths requested before the renderer could receive them. */
const pending: string[] = []
/** Paths this process handed to the renderer; the only ones it reads or watches on request. */
const granted = new Set<string>()

/** Whether the window has been given a folder for its file tree. */
let hasRoot = false
let rootWatcher: FSWatcher | null = null
let treeTimer: NodeJS.Timeout | undefined
let watchedFiles: string[] = []
const fileWatcher = watchFiles((path) => win?.webContents.send('file-changed', path))
/** Jobs being laid out, by the id of their print window; `done` receives an error message on failure. */
const printJobs = new Map<number, { job: PrintJob; done(error?: string): void }>()

// The application's pages get an origin of their own, so that 'self' in their content security
// policy means the bundled files only, not every file on the disk.
protocol.registerSchemesAsPrivileged([
  { scheme: 'mdv-app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
  { scheme: 'mdv-file', privileges: { standard: true, secure: true } }
])

async function openPath(path: string): Promise<void> {
  if (!rendererReady) {
    pending.push(path)
    return
  }
  const info = await stat(path).catch(() => null)
  let target: OpenTarget
  if (info?.isDirectory()) {
    const readme = (await readdir(path)).map((name) => join(path, name)).find((file) => README.test(basename(file)))
    const isFile = readme && (await stat(readme).catch(() => null))?.isFile()
    target = { root: path, file: isFile ? readme : undefined }
  } else if (info?.isFile()) {
    // With no folder open, the file tree shows the folder the file is in.
    target = { root: hasRoot ? undefined : dirname(path), file: path }
  } else {
    return
  }
  hasRoot = true
  for (const name of [target.root, target.file]) if (name) granted.add(name)
  win?.webContents.send('open', target)
}

/** Loads a renderer page into a window, which may not open others or navigate away. */
function load(window: BrowserWindow, page: string): void {
  const { webContents } = window
  webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
  webContents.on('will-navigate', (event, url) => {
    // The development server reloads the page on its own.
    if (app.isPackaged || url !== webContents.getURL()) event.preventDefault()
  })
  const devServer = !app.isPackaged && process.env['ELECTRON_RENDERER_URL']
  window.loadURL(devServer ? `${devServer}/${page}` : `mdv-app://app/${page}`)
}

/** Lays the document out in a hidden window of its own, then prints it or saves it as PDF. */
async function print({ pdf, file, ...content }: PrintRequest): Promise<void> {
  let target: string | undefined
  if (pdf) {
    target = (
      await dialog.showSaveDialog(win!, {
        defaultPath: file.slice(0, file.length - extname(file).length) + '.pdf',
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      })
    ).filePath
    if (!target) return
  }

  const printer = new BrowserWindow({
    parent: win!,
    show: false,
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true }
  })
  const { id } = printer.webContents
  const job: PrintJob = {
    ...content,
    title: basename(file),
    pageSize: LETTER_COUNTRIES.includes(app.getLocaleCountryCode()) ? 'Letter' : 'A4'
  }
  const error = await new Promise<string | null | undefined>((resolve) => {
    printJobs.set(id, { job, done: resolve })
    printer.once('closed', () => resolve(null))
    load(printer, 'print.html')
  })
  printJobs.delete(id)
  if (error === null) return
  try {
    if (error) throw new Error(error)
    if (target) {
      const options = { preferCSSPageSize: true, printBackground: true, generateTaggedPDF: true, generateDocumentOutline: true }
      await writeFile(target, await printer.webContents.printToPDF(options))
    } else {
      await new Promise<void>((done, fail) =>
        printer.webContents.print({ printBackground: true }, (success, reason) =>
          success || reason === 'Print job canceled' ? done() : fail(new Error(reason))
        )
      )
    }
  } catch (failure) {
    dialog.showErrorBox(pdf ? 'PDF export failed' : 'Printing failed', String(failure))
  } finally {
    if (!printer.isDestroyed()) printer.destroy()
  }
}

async function pick(kind: 'file' | 'folder'): Promise<void> {
  if (!win) createWindow()
  const { filePaths } = await dialog.showOpenDialog(
    win!,
    kind === 'folder'
      ? { properties: ['openDirectory'] }
      : {
          properties: ['openFile', 'multiSelections'],
          filters: [
            { name: 'Markdown', extensions: MARKDOWN_EXT },
            { name: 'All Files', extensions: ['*'] }
          ]
        }
  )
  for (const path of filePaths) await openPath(path)
}

function createWindow(): void {
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 640,
    minHeight: 400,
    icon,
    // The page background (--bg in app.css), so the window does not flash white in the dark theme.
    // Shown at once: waiting for 'ready-to-show' can leave it hidden, as that event does not always fire.
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#0d1117' : '#ffffff',
    webPreferences: { preload: join(__dirname, '../preload/index.js'), sandbox: true }
  })
  win.on('closed', () => {
    win = null
    rendererReady = false
    hasRoot = false
  })

  load(win, 'index.html')
}

function buildMenu(): void {
  const send = (action: MenuAction) => () => win?.webContents.send('menu', action)
  const theme = (label: string, source: typeof nativeTheme.themeSource): MenuItemConstructorOptions => ({
    label,
    type: 'radio',
    checked: nativeTheme.themeSource === source,
    click: () => (nativeTheme.themeSource = source)
  })
  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' } as const] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Open File…', accelerator: 'CmdOrCtrl+O', click: () => pick('file') },
        { label: 'Open Folder…', accelerator: 'CmdOrCtrl+Shift+O', click: () => pick('folder') },
        { type: 'separator' },
        { label: 'Print…', accelerator: 'CmdOrCtrl+P', click: send('print') },
        { label: 'Export as PDF…', accelerator: 'CmdOrCtrl+Shift+E', click: send('export-pdf') },
        { type: 'separator' },
        { label: 'Close Tab', accelerator: 'CmdOrCtrl+W', click: send('close-tab') },
        ...(isMac ? [] : [{ role: 'quit' } as const])
      ]
    },
    {
      label: 'Edit',
      submenu: [
        // Hidden rather than removed: on macOS, text fields such as the find bar only get
        // the undo, redo, cut and paste shortcuts from Edit menu role items.
        { role: 'undo', visible: false },
        { role: 'redo', visible: false },
        { role: 'cut', visible: false },
        { role: 'copy' },
        { role: 'paste', visible: false },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: 'Find…', accelerator: 'CmdOrCtrl+F', click: send('find') }
      ]
    },
    {
      label: 'View',
      submenu: [
        { label: 'Toggle File Tree', accelerator: 'CmdOrCtrl+B', click: send('toggle-sidebar') },
        { label: 'Toggle Table of Contents', accelerator: 'CmdOrCtrl+Shift+B', click: send('toggle-toc') },
        { type: 'separator' },
        { label: 'Back', accelerator: isMac ? 'Cmd+[' : 'Alt+Left', click: send('back') },
        { label: 'Forward', accelerator: isMac ? 'Cmd+]' : 'Alt+Right', click: send('forward') },
        { type: 'separator' },
        { label: 'Next Tab', accelerator: 'Ctrl+Tab', click: send('next-tab') },
        { label: 'Previous Tab', accelerator: 'Ctrl+Shift+Tab', click: send('prev-tab') },
        { type: 'separator' },
        { label: 'Theme', submenu: [theme('System', 'system'), theme('Light', 'light'), theme('Dark', 'dark')] },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'reload' } as const, { role: 'toggleDevTools' } as const])
      ]
    },
    { role: 'windowMenu' },
    { role: 'help', submenu: [{ label: 'About mdv', click: send('about') }] }
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

/** Location of the license list Electron ships for Chromium and the software bundled with it. */
function chromiumLicenses(): string {
  const file = 'LICENSES.chromium.html'
  // On macOS it sits beside the application bundle; the packaged app carries a copy in its resources.
  if (isMac) return join(process.resourcesPath, app.isPackaged ? '.' : '../../..', file)
  return join(process.resourcesPath, '..', file)
}

function registerIpc(): void {
  /** Handles a request from the main window only: the print window holds document markup. */
  const handle = (channel: string, listener: Parameters<typeof ipcMain.handle>[1]): void =>
    ipcMain.handle(channel, (event, ...args) => {
      if (event.sender !== win?.webContents) throw new Error(`${channel} is not available to this window`)
      return listener(event, ...args)
    })
  const needGrant = (path: string): void => {
    if (!granted.has(path)) throw new Error(`${path} was not opened by the user`)
  }
  const grantFiles = (node: TreeNode): void => {
    if (node.children) node.children.forEach(grantFiles)
    else granted.add(node.path)
  }

  handle('ready', async () => {
    rendererReady = true
    for (const path of pending.splice(0)) await openPath(path)
  })
  handle('pick', (_event, kind: 'file' | 'folder') => pick(kind))
  handle('open', (_event, path: string) => openPath(path))

  handle('read-tree', async (_event, root: string) => {
    needGrant(root)
    const tree = await readTree(root)
    grantFiles(tree)
    return tree
  })

  handle('read-file', (_event, path: string) => {
    needGrant(path)
    return readFile(path, 'utf8')
  })

  handle('resolve-link', async (_event, from: string, href: string): Promise<LinkTarget | null> => {
    needGrant(from)
    const target = resolveLink(from, href)
    if (!target || !isMarkdown(target.file) || !(await stat(target.file).catch(() => null))?.isFile()) return null
    granted.add(target.file)
    return target
  })

  handle('watch-root', async (_event, root: string) => {
    needGrant(root)
    await rootWatcher?.close()
    rootWatcher = watchFolder(root, () => {
      clearTimeout(treeTimer)
      treeTimer = setTimeout(() => win?.webContents.send('tree-changed'), 200)
    })
  })

  handle('watch-files', (_event, files: string[]) => {
    files.forEach(needGrant)
    fileWatcher.unwatch(watchedFiles.filter((file) => !files.includes(file)))
    fileWatcher.add(files.filter((file) => !watchedFiles.includes(file)))
    watchedFiles = files
  })

  handle('open-external', (_event, url: string) => {
    if (EXTERNAL_LINK.test(url)) return shell.openExternal(url)
  })

  handle('about', async (): Promise<AboutInfo> => {
    // Written by the renderer build; absent when running from source before any build.
    const generated = await readFile(join(RENDERER, 'licenses.json'), 'utf8').catch(() => null)
    const { electron, chrome, node, v8 } = process.versions
    return {
      version: app.getVersion(),
      versions: { electron, chrome, node, v8 },
      ...(generated ? JSON.parse(generated) : { license: '', components: [] })
    }
  })

  handle('open-chromium-licenses', () => shell.openPath(chromiumLicenses()))
  handle('print', (_event, request: PrintRequest) => print(request))
  handle('copy-menu', (_event, text: string) =>
    Menu.buildFromTemplate([
      { role: 'copy' },
      { label: 'Copy as Plain Text', click: () => clipboard.writeText(text) }
    ]).popup({ window: win! })
  )

  // Called by a print window, about its own job.
  ipcMain.handle('print-job', (event) => printJobs.get(event.sender.id)!.job)
  ipcMain.handle('print-done', (event, error?: string) => printJobs.get(event.sender.id)!.done(error))
  ipcMain.handle('print-pages', async (event) => {
    const names = printJobs.get(event.sender.id)!.job.toc.map((_, index) => TOC_ANCHOR + index)
    return destinationPages(await event.sender.printToPDF({ preferCSSPageSize: true }), names)
  })
}

/** Paths named on a command line; in development the first positional argument is the app itself. */
function commandLinePaths(argv: string[], cwd: string): string[] {
  const positional = argv.slice(1).filter((arg) => !arg.startsWith('-'))
  return positional.slice(app.isPackaged ? 0 : 1).map((path) => resolve(cwd, path))
}

// Development and test runs must not share the instance lock (or settings) of an installed copy.
if (!app.isPackaged) app.setPath('userData', `${app.getPath('userData')}-dev`)

pending.push(...commandLinePaths(process.argv, process.cwd()))

app.on('second-instance', (_event, argv, cwd) => {
  if (!win) createWindow()
  else {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
  for (const path of commandLinePaths(argv, cwd)) openPath(path)
})

app.on('open-file', (event, path) => {
  event.preventDefault()
  if (app.isReady() && !win) createWindow()
  openPath(path)
})

app.on('window-all-closed', () => {
  if (!isMac) app.quit()
})

function start(): void {
  // Serves the bundled pages and their assets.
  protocol.handle('mdv-app', (request) => {
    const file = join(RENDERER, decode(new URL(request.url).pathname))
    return file.startsWith(RENDERER + sep) ? net.fetch(pathToFileURL(file).toString()) : new Response(null, { status: 403 })
  })

  // Serves images referenced by an open document, resolved against that document's directory.
  // Document content can forge these URLs, so `base` is only trusted when it is an open file.
  protocol.handle('mdv-file', (request) => {
    const { searchParams } = new URL(request.url)
    const base = searchParams.get('base') ?? ''
    const src = decode((searchParams.get('src') ?? '').split(/[?#]/)[0])
    const path = watchedFiles.includes(base) ? resolveImage(base, src) : null
    return path ? net.fetch(pathToFileURL(path).toString()) : new Response(null, { status: 403 })
  })

  registerIpc()
  buildMenu()
  createWindow()
  app.on('activate', () => {
    if (!win) createWindow()
  })
}

// A second launch hands its paths to the running instance and exits.
if (app.requestSingleInstanceLock()) app.whenReady().then(start)
else app.quit()
