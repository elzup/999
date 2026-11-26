// src/db4/marks.js の型 (アプリが読む分)
type MarkTable = Readonly<Record<string, { label: string }>>

export const ATTRS: MarkTable
export const WORD_LABELS: MarkTable
export const LINK_LABELS: MarkTable
export const DROPPED_LABELS: Readonly<
  Record<string, { label: string; to: string }>
>
export function markLabel(code: string): string
