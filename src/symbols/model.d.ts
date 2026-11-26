// アプリ (TypeScript) から src/symbols/model.js を読むための型。中身は model.js のコメントを参照
export type WordCategory = 'hito' | 'mono' | 'action'

export type Word = {
  id: string
  category: WordCategory
  text: string
  source: string
}

export type Link = {
  wordId: string
  order: number
  tags: string[]
  labels: string[]
  kana?: string
  /** 一覧に語があっても枠が空 */
  slotted?: false
  /** カードの動作 */
  act?: string
  rating?: number | null
}

export type SymbolKind = 'num' | 'date' | 'card'

export type Sym = {
  id: string
  kind: SymbolKind
  num?: string
  suit?: string
  rank?: string
  links: Link[]
  [key: string]: unknown
}

export type Converted = { symbol: Sym; words: Word[] }

export function fromNumberDoc(doc: Record<string, unknown>): Converted
export function toNumberDoc(
  symbol: Sym,
  wordsById: Record<string, Word>
): Record<string, unknown>
export function fromNumberEntry(entry: Record<string, unknown>): Converted
export function toNumberEntry(
  symbol: Sym,
  wordsById: Record<string, Word>
): Record<string, unknown>
export function fromCard(card: Record<string, unknown>): Converted
export function toCard(
  symbol: Sym,
  wordsById: Record<string, Word>
): Record<string, unknown>
export function symbolIdOfNumber(num: string): string
export function byId(words: Word[]): Record<string, Word>
