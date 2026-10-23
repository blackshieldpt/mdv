// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import { contextBridge, ipcRenderer, webUtils } from 'electron'
import type { MdvApi } from '../shared/types'

function subscribe<Args extends unknown[]>(channel: string) {
  return (listener: (...args: Args) => void): (() => void) => {
    const handler = (_event: unknown, ...args: unknown[]): void => listener(...(args as Args))
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  }
}

const api: MdvApi = {
  ready: () => ipcRenderer.invoke('ready'),
  pick: (kind) => ipcRenderer.invoke('pick', kind),
  open: (file) => ipcRenderer.invoke('open', webUtils.getPathForFile(file)),
  readTree: (root) => ipcRenderer.invoke('read-tree', root),
  readFile: (path) => ipcRenderer.invoke('read-file', path),
  resolveLink: (from, href) => ipcRenderer.invoke('resolve-link', from, href),
  watchRoot: (root) => ipcRenderer.invoke('watch-root', root),
  watchFiles: (files) => ipcRenderer.invoke('watch-files', files),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  print: (request) => ipcRenderer.invoke('print', request),
  copyMenu: (text) => ipcRenderer.invoke('copy-menu', text),
  printJob: () => ipcRenderer.invoke('print-job'),
  printDone: (error) => ipcRenderer.invoke('print-done', error),
  printPages: () => ipcRenderer.invoke('print-pages'),
  about: () => ipcRenderer.invoke('about'),
  openChromiumLicenses: () => ipcRenderer.invoke('open-chromium-licenses'),
  onOpen: subscribe('open'),
  onMenu: subscribe('menu'),
  onTreeChanged: subscribe('tree-changed'),
  onFileChanged: subscribe('file-changed')
}

contextBridge.exposeInMainWorld('mdv', api)
