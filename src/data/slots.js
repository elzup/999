// 1 番号が持つ語スロットの定義。正本はここだけ。
//
// これまで同じ並びが 6 箇所に書かれていた (rep-store の SLOT_ORDER、
// firestore/number-doc の SLOT_KEYS、app/data/schema と generate-preview-data の
// buildCandidateSlotShape、app/data/parse の列名、memo-target の ROLES)。
// 候補を 4 件目にするだけで 6 箇所を直す必要があり、直し漏れは静かに片側だけ効く。
//
// 候補を増やすときは CANDIDATE_DEPTH を上げる。コード側はこれで全部追従する
// (シートに `wh4` / `wh4k` / `wh4Img` の列を足すのは別途手作業)。
//
// 依存を持たない素の ESM。node のスクリプト (src/ / console/) と
// vite のアプリ (app/)、Firestore の検証 (src/firestore/) が同じものを読む。

/** 候補スロットの系統。wh = 人系 (本命側) / wm = 物系 (対抗側) */
export const CANDIDATE_PREFIXES = ['wh', 'wm']

/** 1 系統あたりの候補数 */
export const CANDIDATE_DEPTH = 3

/** 候補スロットの並び。rep-store / Firestore / アプリで同じ順序を使う */
export const SLOT_KEYS = CANDIDATE_PREFIXES.flatMap((prefix) =>
  Array.from({ length: CANDIDATE_DEPTH }, (_, i) => `${prefix}${i + 1}`)
)

/**
 * 代表語の既定優先順。系統をまたいで浅い候補から採る (人1 → 物1 → 人2 …)。
 * SLOT_KEYS が系統ごとの並びなのに対し、こちらは深さごとの並び。
 */
export const PRIORITY_KEYS = Array.from(
  { length: CANDIDATE_DEPTH },
  (_, i) => i + 1
).flatMap((rank) => CANDIDATE_PREFIXES.map((prefix) => `${prefix}${rank}`))

/** 本命語 / 対抗語。候補とは別枠で、歌詞・読みドリル・スコアが参照する */
export const PRIMARY_KEYS = ['w1', 'w2']

/** 候補も含めた、1 番号が持ちうる語スロットすべて */
export const ALL_SLOT_KEYS = [...PRIMARY_KEYS, ...SLOT_KEYS]

/** スロット名 → TSV / JSON の列名 */
export const slotFields = (slot) => ({
  word: slot,
  kana: `${slot}k`,
  image: `${slot}Img`,
})

/**
 * 候補スロットが空のときに読み替える旧列。
 * wh1/wm1 は本命・対抗そのもの、wh2/wm2 は予備語だった頃の列を引き継ぐ。
 */
export const LEGACY_SLOT_SOURCE = {
  wh1: 'w1',
  wh2: 'w1_2',
  wm1: 'w2',
  wm2: 'w2_2',
}
