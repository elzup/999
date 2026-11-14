import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'

/**
 * 結果ビューなど、どのタブの中からでも番号の詳細パネルと編集を開くための文脈。
 * テストのタブ 9 つに props を通さずに済ませる。
 */
export type NumberContextValue = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
  /** 編集をオーバーレイで開く。今のタブ (テストの結果ビュー) は閉じない */
  openEditor: (num: string) => void
  /**
   * 編集を閉じるたびに 1 増える。配信データに無い値 (マップの代表①) を
   * API から読んでいる画面が、これを見て読み直す
   */
  editVersion: number
  /** タグの表示名 (res → アトリエ)。シートの tags タブから配信データに載せる */
  tagNames?: Record<string, string>
}

export const NumberContext = createContext<NumberContextValue | null>(null)

export const useNumberContext = () => useContext(NumberContext)

/** 'n:573' → '573'。番号以外のキー (カード等) は null */
export function numOfBmKey(key: string | undefined): string | null {
  const match = key?.match(/^n:(\d{3})$/)
  return match ? match[1] : null
}
