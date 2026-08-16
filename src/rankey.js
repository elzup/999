// rankey — 候補語の「3桁ぶんの内訳」を1つの文字列で表す記法 (ランクキー)。pt(scorer.js の総和) が
// 潰してしまう「どの桁がどう賄われているか」を復元できるようにする。
//
//   <3桁ぶんの記号(+中間省略 !)>|<接尾>
//
//   A/B/C  1文字1桁の core/sub/bad          みかみ = BCB|
//   w w    1文字2桁 (と=10 等) の2桁ぶん     きた   = Aww|
//   x      2文字2桁(拗音)の小文字側          しゅろ = AxA|   (し は core なので A)
//   t      促音                              ろっし = AtA|
//   _      先頭0の省略 (2桁しか無い)         れい   = _CA|
//   !      中間の省略                        りんご = ww!A|   (ん を飛ばす)
//   v      2桁トークンが3桁境界を跨ぐ        たま   = wwv|v
//
//   接尾 (パイプの後ろ)
//   v      境界を跨いだ2桁の外側
//   n / -  余りが「ん」「ー」だけ             にいさん = AAA|n / ミッキー = BtA|-
//   . / .. 余りが1文字 / 2文字以上            トマス   = wwv|v. / フリックル = Bww|..
//   ※ 余りは「読みが3桁を超えた分」(のるん の ん) と「語が読みより長い分」
//      (ミッキー の ー) の両方を指す。どちらも3桁に乗らなかったかな。
//   m      mix (同じ数字を別のかなで表す)
//
// 「ん」は single に 0(core) があるため単独で賄える。「ー」は single に無いので
// LONG_DIGIT (ひー=11 等) が要る。余りの n と - を特別扱いするのはこの非対称のため。

import { getTier, score } from './scorer.js'
import { kataToHira, normalizeDakuten, normalizeSmallVowel } from './table.js'

const TIER_MARK = { core: 'A', sub: 'B', bad: 'C' }
const TARGET = 3
// 小書きの拗音。2文字目がこれなら小書き側は独立した音を持たないので x を当てる
const SMALL_YOUON = ['ゃ', 'ゅ', 'ょ', 'ャ', 'ュ', 'ョ']

const toHira = (s) => [...normalizeDakuten(s)].map(kataToHira).join('')

/** 語の表記から辞書タグ(#xxx)とラベル(-a 等)を落とす */
export function cleanWord(word) {
  return String(word || '')
    .replace(/#[^\s,]+/g, '')
    .replace(/(^|\s)-[a-z](?=\s|$)/g, '')
    .trim()
}

/**
 * 語のうち読みで使われなかった部分 (余り) を返す。
 * 語が漢字などかな以外を含む場合は測れないので null。
 */
export function leftoverOf(word, kana) {
  const w = cleanWord(word)
  if (!w || !/^[ぁ-んァ-ヶーゝゞ]+$/.test(w)) return null
  const hw = toHira(w)
  const hk = toHira(kana)
  return hw.startsWith(hk) ? hw.slice(hk.length) : null
}

/** 余り文字列 → 接尾記号 */
export function leftoverMark(rest) {
  if (!rest) return ''
  if (rest === 'ん') return 'n'
  if (rest === 'ー') return '-'
  return [...rest].length === 1 ? '.' : '..'
}

/**
 * かな1文字の tier。小書き母音 (ぃ→い) も引けるようにする。
 * scorer.getTier はここを正規化しないため、単独で使うと ぃ が tier なしになる。
 */
function tierOf(ch) {
  return getTier(ch) ?? getTier(normalizeSmallVowel(ch))
}

/** かな1文字の記号。ー は single に無いので専用記号を当てる */
function charMark(ch) {
  if (ch === 'ー') return '-'
  return TIER_MARK[tierOf(ch)] ?? 'w'
}

/** 1トークンが占める各桁の記号を返す (桁数ぶんの配列) */
function tokenMarks(token) {
  const width = token.value.length
  if (token.type === 'sokuon') return ['t']
  if (token.type === 'single')
    return [TIER_MARK[token.tier ?? tierOf(token.kana)] ?? '?']
  if (token.type === 'halfOverflow') return Array(width).fill('v')
  if (token.type === 'double') {
    const chars = [...token.kana]
    // 1文字2桁 (た=55): どちらの桁も1文字に紐づかないので w w
    if (chars.length !== 2) return Array(width).fill('w')
    // 拗音 (しゅ=47): 小書き側は独立した音ではないので x
    if (SMALL_YOUON.includes(chars[1])) return [charMark(chars[0]), 'x']
    // それ以外 (しん=40, ろん=60, きー=91): 各文字がそれぞれ1桁を賄う
    return chars.map(charMark)
  }
  return Array(width).fill('?') // overflow は呼び出し側で扱う
}

/**
 * 読みが番号に届かないとき、かな1文字を飛ばせば一致するかを探す (中間省略)。
 * 見つかれば飛ばす位置 (かなインデックス) を返す。
 */
export function findOmission(kana, num) {
  const chars = [...kana]
  for (let i = 1; i < chars.length - 1; i++) {
    const trimmed = [...chars.slice(0, i), ...chars.slice(i + 1)].join('')
    try {
      if (score(trimmed).digits === num) return i
    } catch {
      /* 飛ばした結果が読めない並びなら候補外 */
    }
  }
  return -1
}

/**
 * 候補語 1 件の記法を組み立てる。
 * @param {string} kana 読み
 * @param {string} num  3桁の番号
 * @param {string} word 語 (余りの算出用。省略可)
 */
export function rankey(kana, num, word = '') {
  let reading = kana
  let omitAt = -1
  let detail
  try {
    detail = score(reading, TARGET)
  } catch {
    return null
  }

  if (detail.digits !== num) {
    const at = findOmission(kana, num)
    if (at >= 0) {
      omitAt = at
      const chars = [...kana]
      reading = [...chars.slice(0, at), ...chars.slice(at + 1)].join('')
      detail = score(reading, TARGET)
    }
  }

  const marks = []
  let consumed = 0 // 記法に載せたかな数 (省略記号の挿入位置合わせ用)
  let overflowKana = '' // 3桁を完全に超えたかな。接尾で表す

  for (const token of detail.tokens) {
    if (token.type === 'overflow') {
      overflowKana += token.kana
      continue
    }
    marks.push(...tokenMarks(token))
    consumed += [...token.kana].length
    if (omitAt >= 0 && consumed === omitAt) marks.push('!')
  }

  // 先頭0の省略: 3桁に足りない分を _ で埋める
  const shortBy = TARGET - detail.digits.length
  const head = shortBy > 0 ? '_'.repeat(shortBy) : ''

  const body = head + marks.slice(0, TARGET + (omitAt >= 0 ? 1 : 0)).join('')
  const tail = marks.slice(TARGET + (omitAt >= 0 ? 1 : 0)).join('')

  // 余りは2系統ある。読みが3桁を超えた分 (のるん の ん) と、語が読みより長い分
  // (ミッキー の ー)。どちらも「3桁に乗らなかったかな」なので繋げて1つの記号にする。
  const rest = overflowKana + (leftoverOf(word, kana) || '')
  const suffix = tail + leftoverMark(rest) + (detail.mix ? 'm' : '')

  return `${body}|${suffix}`
}
