// SPDX-FileCopyrightText: 2026 BlackShield LDA
// SPDX-License-Identifier: Apache-2.0

/** Links the application hands to the system: web pages and mail. */
export const EXTERNAL_LINK = /^(https?|mailto):/i

export function decode(value: string): string {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}
