import { createContext } from 'preact'
import { useContext } from 'preact/hooks'
import { TAG_MEANINGS } from './wordTags'

/** タグ id → 表示名。配信データ (tagNames) を App で流し込む */
export const TagNamesContext = createContext<Record<string, string>>({})

export const useTagNames = () => useContext(TagNamesContext)

/** 表示名。配信データ → 組み込みの意味 (#g 概念 等) → id の順に引く */
export function tagNameOf(tag: string, names: Record<string, string>): string {
  return names[tag] ?? TAG_MEANINGS[tag] ?? tag
}
