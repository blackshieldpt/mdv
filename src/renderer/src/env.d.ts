// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

import type { MdvApi } from '../../shared/types'

declare global {
  interface Window {
    mdv: MdvApi
  }
}
