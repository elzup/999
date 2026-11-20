import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import { parseWord, TAG_MEANINGS } from './wordTags'

// タグの名前は 2 つ。画面に出すのは略称 (short_title、無ければ title)、見出し・説明・検索の
// 展開は正式名 (title)。どちらもこのモジュールの関数を通して引く (タグの id を画面に出さない)

/** タグ id → 表示名 (略称)。配信データ (tagNames) を App で流し込む */
export const TagNamesContext = createContext<Record<string, string>>({})

/** タグ id → 正式名 (title)。配信データ (tagTitles) を App で流し込む */
export const TagTitlesContext = createContext<Record<string, string>>({})

export const useTagNames = () => useContext(TagNamesContext)
export const useTagTitles = () => useContext(TagTitlesContext)

/** 表示名 (略称)。配信データ → 組み込みの意味 (#g 概念 等) → id の順に引く */
export function tagNameOf(tag: string, names: Record<string, string>): string {
  return names[tag] ?? TAG_MEANINGS[tag] ?? tag
}

/** 正式名 (title)。無ければ表示名 */
export function tagTitleOf(
  tag: string,
  titles: Record<string, string>,
  names: Record<string, string>
): string {
  return titles[tag] ?? tagNameOf(tag, names)
}

/** 画面でタグの名前を引く口。short は略称、title は正式名 */
export function useTagLabel() {
  const names = useTagNames()
  const titles = useTagTitles()
  return {
    names,
    titles,
    short: (tag: string) => tagNameOf(tag, names),
    title: (tag: string) => tagTitleOf(tag, titles, names),
  }
}

/**
 * 語を文字だけで出すとき (title・aria-label・通知の文など、TaggedWord を置けない所) の書き方。
 * タグは id ではなく表示名を括弧で添え、ラベル (-n 等) は落とす: 鯉#g → «鯉 (概念)»
 */
export function wordText(word: string, names: Record<string, string>): string {
  const { base, tags } = parseWord(word)
  return tags.length
    ? `${base} (${tags.map((t) => tagNameOf(t, names)).join('・')})`
    : base
}
