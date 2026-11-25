import { createContext } from 'preact'
import { useContext, useMemo } from 'preact/hooks'
import { TAG_MEANINGS } from './wordTags'

/** タグ id → 表示名。配信データ (tagNames) を App で流し込む */
export const TagNamesContext = createContext<Record<string, string>>({})

export const useTagNames = () => useContext(TagNamesContext)

/** タグ id → 正式名 (シートの title)。配信データ (tagTitles) を App で流し込む */
export const TagTitlesContext = createContext<Record<string, string>>({})

/**
 * 正式名を優先した表示名 (正式名 → 略称)。タグは基本これで出し、
 * 表示が狭い所 (一覧のマス・代表のチップ等) だけ略称 (useTagNames) を使う
 */
export function useLongTagNames(): Record<string, string> {
  const short = useTagNames()
  const titles = useContext(TagTitlesContext)
  return useMemo(() => ({ ...short, ...titles }), [short, titles])
}

/** 表示名。配信データ → 組み込みの意味 (#g 概念 等) → id の順に引く */
export function tagNameOf(tag: string, names: Record<string, string>): string {
  return names[tag] ?? TAG_MEANINGS[tag] ?? tag
}
