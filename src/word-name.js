// 語から名前を取り出す・かなだけの語か見る (ブラウザでも読める部分。words.js は node:fs を使う)
import { kataToHira } from './table.js'

/** w1/w2 から名前部分を抽出 (タグ・注釈を除去) */
export function extractName(w) {
  if (!w) return ''
  const beforeTag = w.split('#')[0].trim()
  const beforeSuffix = beforeTag.replace(/\s+-\w+$/g, '').trim()
  const beforeComma = beforeSuffix.split(',')[0].trim()
  const withoutParen = beforeComma.replace(/\([^)]*\)/g, '').trim()
  return withoutParen
}

/** ひらがな・カタカナ・長音符・中黒のみか判定 */
export function isKanaOnly(str) {
  if (!str) return false
  return /^[\u3040-\u309F\u30A0-\u30FF\u30FC\u30FB]+$/.test(str)
}

/** カタカナ混在文字列をひらがなに正規化 */
export function toHiragana(str) {
  return [...str].map((ch) => kataToHira(ch)).join('')
}
