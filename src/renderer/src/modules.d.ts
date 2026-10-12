// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

declare module 'markdown-it-deflist' {
  import type { PluginSimple } from 'markdown-it'
  const deflist: PluginSimple
  export default deflist
}

declare module 'markdown-it-emoji' {
  import type { PluginSimple } from 'markdown-it'
  export const full: PluginSimple
}
