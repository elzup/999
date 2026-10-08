import type { ComponentChildren } from 'preact'

// スライドショーに流す 1 枚。問題面 (prompt) を先に見せ、少し置いて答え面 (answer) を出す。
export type SlideItem = {
  // デッキ内で一意。履歴と OK 印の識別に使う。
  id: string
  prompt: ComponentChildren
  answer: ComponentChildren
  // ブックマークと連動させる場合のキー ('n:123' / 'c:SA' など)。無ければ ★ を出さない。
  bmKey?: string
}

// グループごとの出題セット。SlidePlayer はデッキの中身を知らずに再生する。
export type SlideDeck = {
  // OK 印の保存先を分けるための識別子。
  id: string
  title: string
  items: SlideItem[]
}

export function deckHasBookmarks(deck: SlideDeck): boolean {
  return deck.items.some((item) => Boolean(item.bmKey))
}
