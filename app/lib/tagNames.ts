import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import { parseWord, TAG_MEANINGS } from './wordTags'

/** タグ id → 表示名。配信データ (tagNames) を App で流し込む */
export const TagNamesContext = createContext<Record<string, string>>({})

export const useTagNames = () => useContext(TagNamesContext)

/** 表示名。配信データ → 組み込みの意味 (#g 概念 等) → id の順に引く */
export function tagNameOf(tag: string, names: Record<string, string>): string {
  return names[tag] ?? TAG_MEANINGS[tag] ?? tag
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
