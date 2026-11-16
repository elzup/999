// 画像を付ける対象 (番号・日付・カード) と、その枠の定義。
// manifest / keep / redo / candidates のキーは対象 ID で、ID の形で種類が決まる:
//   3 桁 = 番号 / 4 桁 = 日付 (10〜12 月 = 1001〜1231。1〜9 月は 3 桁で番号の画像を使う)
//   ランク + S/H/C/D = カード (例 AS, 10H。トランプの表記と同じ順)
// ID 同士が衝突しないので、既存の番号キーを書き換えずに種類を足せる。

import { isDateKey4 } from '../date-keys.js'
import { expandVariants } from './tag-variants.js'

// 番号・日付の枠。人 1〜3 → 物 1〜3 の順 (シートの wh1〜wm3)。
// 1・2 番目は keep/manifest が旧キー (w1 = wh1, w1_2 = wh2, w2 = wm1, w2_2 = wm2) で
// 保存済みのため旧名のまま持ち、3 番目は wh3 / wm3 の名前で持つ
const WORD_SLOTS = ['w1', 'w1_2', 'wh3', 'w2', 'w2_2', 'wm3']

// 番号の一括パイプライン (search/fetch スクリプト、words.tsv の旧 4 列) が受け持つ枠。
// それ以外 (3 番目・タグ違いの枠) は語から直接検索する
export const PIPELINE_SLOTS = ['w1', 'w2', 'w1_2', 'w2_2']

/** 枠の正式名 (シート・DB の名前)。console の見出しに出す */
export const CANONICAL_SLOT = {
  w1: 'wh1',
  w1_2: 'wh2',
  wh3: 'wh3',
  w2: 'wm1',
  w2_2: 'wm2',
  wm3: 'wm3',
}

export const IMAGE_KINDS = {
  num: { label: '番号', slots: WORD_SLOTS },
  date: { label: '日付', slots: WORD_SLOTS },
  card: { label: 'カード', slots: ['P', 'A', 'O'] },
}

export function kindOf(id) {
  if (/^\d{3}$/.test(id)) return 'num'
  if (isDateId(id)) return 'date'
  if (/^([2-9]|10|[AJQK])[SHCD]$/.test(id)) return 'card'
  return null
}

// 日付の画像は 4 桁になる 10〜12 月の分を持つ (シートの 1231 タブと同じ範囲)
const isDateId = (id) => isDateKey4(id)

export const cardId = (card) => `${card.rank}${card.suit}`

// 多候補スキーマ (wh1-3=人 / wm1-3=物) を console の枠に寄せる (1・2 番目は旧スロット名)
export function wordTarget(kind, w) {
  return {
    id: w.num,
    kind,
    w1: w.w1 || w.wh1,
    w1k: w.w1k || w.wh1k,
    w2: w.w2 || w.wm1,
    w2k: w.w2k || w.wm1k,
    w1_2: w.w1_2 || w.wh2,
    w2_2: w.w2_2 || w.wm2,
    wh3: w.wh3,
    wm3: w.wm3,
  }
}

export function cardTarget(card) {
  return {
    id: cardId(card),
    kind: 'card',
    P: card.person,
    A: card.action,
    O: card.object,
  }
}

const hasAnyWord = (t) => IMAGE_KINDS[t.kind].slots.some((slot) => t[slot])

/**
 * 語のある対象だけを、番号 → 日付 → カードの順に並べる。
 * slots はその対象の枠の並びで、タグ違いの語は «旧スロット#タグ» の枠に分けてある (D-0041)
 */
export function buildTargets({ words = [], dates = [], cards = [] }) {
  return [
    ...words.map((w) => wordTarget('num', w)),
    ...dates.filter((w) => isDateId(w.num)).map((w) => wordTarget('date', w)),
    ...cards.map(cardTarget),
  ]
    .filter(hasAnyWord)
    .map((t) => expandVariants(t, IMAGE_KINDS[t.kind].slots))
}

/** manifest の 1 対象分 ({slot: {url}}) を配信データの画像列に写す */
export function imageFieldsOf(kind, slots) {
  if (!slots) return {}
  const fields =
    kind === 'card'
      ? { P: 'personImg', A: 'actionImg', O: 'objectImg' }
      : {
          w1: 'w1Img',
          w2: 'w2Img',
          w1_2: 'w1_2Img',
          w2_2: 'w2_2Img',
          wh3: 'wh3Img',
          wm3: 'wm3Img',
        }
  return Object.fromEntries(
    Object.entries(fields)
      .filter(([slot]) => slots[slot]?.url)
      .map(([slot, field]) => [field, slots[slot].url])
  )
}
