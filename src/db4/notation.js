// 一覧の 1 項目 (`黄泉#ｽﾀﾚ#tri -n`) ⇄ 語の部品。spec: .metarc/db-design-v4.md §3
//
// 1 項目は出典ごとに語 1 つ (出典 2 つなら語 2 つ、同じ role + order の結び付きが 2 つ)。
// 結び付きに残すのは、この項目を元の綴りに戻すための値だけ:
//   attrs    属性タグ (g / i) の並び
//   sourceAt 出典タグを attrs の何番目に差し込むか (0 = 先頭のときは欄なし)
//   labels   ラベル (-x など)
// 戻した綴りが元と違う項目 (タグの並びが変則など) は、元の綴りを raw に残す (取りこぼすより残す)。

import { formatNotation, parseNotation } from '../symbols/model.js'

const ATTRIBUTE_TAGS = new Set(['g', 'i'])

/** 表記の並び (人の側は «語#タグ -ラベル»、物の側は «語 -ラベル#タグ») */
// 表記の書き方は旧の人 / 物の流儀 (物はラベルをタグより先に書く)
const styleOf = (role) => (role === 'thing' ? 'mono' : 'hito')

/** 部品 → 項目の綴り。parts は同じ項目の語 (出典の順) */
export function formatItem(parts, role) {
  if (parts[0].raw !== undefined) return parts[0].raw
  const { text, attrs = [], sourceAt = 0, labels = [] } = parts[0]
  const sources = parts.map((p) => p.source).filter(Boolean)
  const tags = [
    ...attrs.slice(0, sourceAt),
    ...sources,
    ...attrs.slice(sourceAt),
  ]
  return formatNotation({ text, tags, labels }, styleOf(role))
}

/**
 * 項目の綴り → 部品の配列 (出典ごと)。空の項目は []。
 * 各部品 = { text, source, attrs, sourceAt?, labels, raw? }。attrs 以下は先頭の部品だけが持つ
 */
export function parseItem(raw, role) {
  const item = String(raw ?? '').trim()
  if (item === '') return []
  const { text, tags, labels } = parseNotation(item)
  const sources = [...new Set(tags.filter((t) => !ATTRIBUTE_TAGS.has(t)))]
  const attrs = tags.filter((t) => ATTRIBUTE_TAGS.has(t))
  const firstSource = tags.findIndex((t) => !ATTRIBUTE_TAGS.has(t))
  const sourceAt = firstSource < 0 ? 0 : tags.slice(0, firstSource).length
  const layout = { attrs, ...(sourceAt > 0 ? { sourceAt } : {}), labels }
  const parts = (sources.length ? sources : ['']).map((source, i) => ({
    text,
    source,
    ...(i === 0 ? layout : {}),
  }))
  return formatItem(parts, role) === item
    ? parts
    : [{ ...parts[0], raw: item }, ...parts.slice(1)]
}
