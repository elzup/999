import {
  DOUBLE_DIGIT,
  LONG_DIGIT,
  kataToHira,
  normalizeDakuten,
  normalizeSmallVowel,
} from './table.js'
import { encode } from './encoder.js'

const isTwoChar = (kana) => [...kana].length === 2

/**
 * かな2文字の読み一覧。
 *   youon = 拗音・外来音 (ちゃ=28, ふぁ=58 …) / long = 長音 (かー=98, いー=11 …)
 */
export const TWO_CHAR_YOMI = [
  ...Object.entries(DOUBLE_DIGIT)
    .filter(([kana]) => isTwoChar(kana))
    .map(([kana, digits]) => ({ kana, digits, kind: 'youon' })),
  ...Object.entries(LONG_DIGIT)
    .filter(([kana]) => isTwoChar(kana))
    .map(([kana, digits]) => ({ kana, digits, kind: 'long' })),
]

const TWO_CHAR_KEYS = new Set(TWO_CHAR_YOMI.map((y) => y.kana))

/**
 * encode が返すトークンのかな → 表のキー。表に無ければ null。
 * encoder の lookup と同じ順で正規化を辿る (生 → 濁点畳み込み → ひらがな化 → 小書き母音)。
 * 順序を変えると じゃ (68) が ちゃ (28) に潰れるなど、意味が変わる。
 */
export function toYomiKey(token) {
  const hira = [...token].map(kataToHira).join('')
  const variants = [
    token,
    normalizeDakuten(token),
    hira,
    normalizeDakuten(hira),
    normalizeSmallVowel(normalizeDakuten(hira)),
  ]
  return variants.find((v) => TWO_CHAR_KEYS.has(v)) ?? null
}

/**
 * 各2文字読みを実際に割り当てている番号を集める。
 * 対象は本命語 (w1k) と対抗語 (w2k) のみ。予備語 (w1_2/w2_2) は編集途中の候補なので数えない。
 * @returns {Record<string, string[]>} かな → 番号 (重複なし・昇順)
 */
export function buildYomiUse(entries) {
  const use = new Map(TWO_CHAR_YOMI.map((y) => [y.kana, new Set()]))

  for (const entry of entries) {
    for (const kana of [entry.w1k, entry.w2k]) {
      if (!kana) continue
      let tokens
      try {
        tokens = encode(kana).tokens
      } catch {
        // 表に無いかなを含む語 (誤記・未整備) は数えない。check:errors 側の担当。
        continue
      }
      for (const token of tokens) {
        const key = toYomiKey(token.kana)
        if (key) use.get(key).add(entry.num)
      }
    }
  }

  return Object.fromEntries(
    [...use].map(([kana, nums]) => [kana, [...nums].sort()])
  )
}
