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
//   ~      拗音4省略 (拗音の直後の う/ん)     びょうに = Bx~A| (う を飛ばす)
//          読みで落とした (びょうに) か、語の側で落とした (読み びょに / 語 びょうにん)
//          かのどちらでも付ける。後者は語がかなだけのときしか測れない
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
// 桁を持たない省略記号。本体の3桁を数えるときは飛ばす
const OMIT_MARKS = new Set(['!', '~'])

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

/**
 * 読みが語から「拗音の直後の う/ん」を落とした形か (読み びょに / 語 びょうにん)。
 * そうなら落とした位置 (読みのかなインデックス) と、その上での余りを返す。
 * 語がそのまま読みで始まる場合 (leftoverOf が測れる場合) や、語にかな以外を含む
 * 場合は null。落とすのは1か所だけで、読みの途中に限る (末尾なら単なる余り)。
 */
export function youonDropOf(word, kana) {
  const w = cleanWord(word)
  if (!w || !/^[ぁ-んァ-ヶーゝゞ]+$/.test(w)) return null
  const hw = [...toHira(w)]
  const hk = toHira(kana)
  if (hw.join('').startsWith(hk)) return null
  const kanaLen = [...hk].length
  for (let p = 1; p < Math.min(hw.length, kanaLen); p++) {
    if (!SMALL_YOUON.includes(hw[p - 1])) continue
    if (hw[p] !== 'う' && hw[p] !== 'ん') continue
    const dropped = [...hw.slice(0, p), ...hw.slice(p + 1)].join('')
    if (dropped.startsWith(hk)) return { at: p, rest: dropped.slice(hk.length) }
  }
  return null
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

  // 拗音4省略の位置 (記法に載せたかな数で数える)。読みで落とした場合は拗音トークンの直後
  const drop = detail.youon4 ? null : youonDropOf(word, kana)
  const youonAt = detail.youon4 ? 2 : drop ? drop.at : -1

  const marks = []
  let consumed = 0 // 記法に載せたかな数 (省略記号の挿入位置合わせ用)
  let overflowKana = '' // 3桁を完全に超えたかな。接尾で表す
  let youonMarked = false

  for (const token of detail.tokens) {
    if (token.type === 'overflow') {
      overflowKana += token.kana
      continue
    }
    marks.push(...tokenMarks(token))
    consumed += [...token.kana].length
    if (omitAt >= 0 && consumed === omitAt) marks.push('!')
    if (youonAt >= 0 && !youonMarked && consumed >= youonAt) {
      marks.push('~')
      youonMarked = true
    }
  }

  // 先頭0の省略: 3桁に足りない分を _ で埋める
  const shortBy = Math.max(0, TARGET - detail.digits.length)
  const head = shortBy > 0 ? '_'.repeat(shortBy) : ''

  // 3桁ぶんの記号までが本体。省略記号 (! ~) は桁を持たないので数えず、
  // 3桁目の直後に来たものも本体に含める
  let cut = 0
  for (let digits = 0; cut < marks.length; cut++) {
    if (OMIT_MARKS.has(marks[cut])) continue
    if (digits === TARGET - shortBy) break
    digits++
  }
  const body = head + marks.slice(0, cut).join('')
  const tail = marks.slice(cut).join('')

  // 余りは2系統ある。読みが3桁を超えた分 (のるん の ん) と、語が読みより長い分
  // (ミッキー の ー)。どちらも「3桁に乗らなかったかな」なので繋げて1つの記号にする。
  const wordRest = drop ? drop.rest : leftoverOf(word, kana) || ''
  const rest = overflowKana + wordRest
  const suffix = tail + leftoverMark(rest) + (detail.mix ? 'm' : '')

  return `${body}|${suffix}`
}
