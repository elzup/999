// かな → 番号 (読みルール) をアプリ側で引く。編集画面で «このかなはどの番号の読みか» を
// その場で出し、別の番号への付け替えを提案するために使う。
//
// 規則表は src/table.js が TSV から読むが、アプリには fs が無い。配信データの rules
// (generate-preview-data.js#buildRulesData が同じ表から作る) から引き直す。
// 変換の手順は src/encoder.js#encode と同じ。食い違いは
// src/__tests__/reading-parity.test.js が全組み合わせで検出する。

import type { RulesData } from '../data/schema'

export type ReadingTables = {
  single: Record<string, string>
  double: Record<string, string>
  long: Record<string, string>
}

export function tablesFromRules(rules: RulesData): ReadingTables {
  const single: Record<string, string> = {}
  for (const [digit, bucket] of Object.entries(rules.singleByDigit)) {
    for (const tier of ['core', 'sub', 'bad'] as const) {
      for (const kana of bucket[tier] ?? []) single[kana] = String(digit)
    }
  }
  const fromMatrix = (matrix: string[][][]) => {
    const map: Record<string, string> = {}
    matrix.forEach((row, r) =>
      row.forEach((kanas, c) => {
        for (const kana of kanas) map[kana] = `${r}${c}`
      })
    )
    return map
  }
  return {
    single,
    double: fromMatrix(rules.doubleMatrix),
    long: fromMatrix(rules.longMatrix),
  }
}

// ---- 正規化 (src/table.js と同じ) ----

// prettier-ignore
const DAKUTEN_MAP: Record<string, string> = {
  が:'か', ぎ:'き', ぐ:'く', げ:'け', ご:'こ',
  ざ:'さ', じ:'し', ず:'す', ぜ:'せ', ぞ:'そ',
  だ:'た', ぢ:'ち', づ:'つ', で:'て', ど:'と',
  ば:'は', び:'ひ', ぶ:'ふ', べ:'へ', ぼ:'ほ',
  ぱ:'は', ぴ:'ひ', ぷ:'ふ', ぺ:'へ', ぽ:'ほ',
  ガ:'か', ギ:'き', グ:'く', ゲ:'け', ゴ:'こ',
  ザ:'さ', ジ:'し', ズ:'す', ゼ:'せ', ゾ:'そ',
  ダ:'た', ヂ:'ち', ヅ:'つ', デ:'て', ド:'と',
  バ:'は', ビ:'ひ', ブ:'ふ', ベ:'へ', ボ:'ほ',
  パ:'は', ピ:'ひ', プ:'ふ', ペ:'へ', ポ:'ほ',
  ゔ:'う', ヴ:'う',
}

const DAKUTEN_YOUON_EXCEPTIONS = new Set([
  'じゃ',
  'じゅ',
  'じょ',
  'ジャ',
  'ジュ',
  'ジョ',
])

// prettier-ignore
const SMALL_VOWEL_MAP: Record<string, string> = {
  ぁ:'あ', ぃ:'い', ぅ:'う', ぇ:'え', ぉ:'お',
}

const SMALL_YYO = ['ゃ', 'ゅ', 'ょ', 'ャ', 'ュ', 'ョ']

function normalizeDakuten(token: string): string {
  if (DAKUTEN_YOUON_EXCEPTIONS.has(token)) return token
  return [...token].map((ch) => DAKUTEN_MAP[ch] ?? ch).join('')
}

function kataToHira(ch: string): string {
  const code = ch.charCodeAt(0)
  return ch.length === 1 && code >= 0x30a1 && code <= 0x30f6
    ? String.fromCharCode(code - 0x60)
    : ch
}

function normalizeSmallVowel(token: string): string {
  return [...token].map((ch) => SMALL_VOWEL_MAP[kataToHira(ch)] ?? ch).join('')
}

const isSokuon = (ch: string) => ch === 'っ' || ch === 'ッ'

// ---- 変換 (src/encoder.js と同じ手順) ----

function lookup(t: ReadingTables, token: string): string | undefined {
  const pick = (key: string) => t.double[key] ?? t.long[key]
  const direct = pick(token)
  if (direct !== undefined) return direct

  const normalized = normalizeDakuten(token)
  const fromNormalized = pick(normalized)
  if (fromNormalized !== undefined) return fromNormalized

  const hira = [...normalized].map(kataToHira).join('')
  const fromHira = pick(hira)
  if (fromHira !== undefined) return fromHira

  const small = normalizeSmallVowel(hira)
  if (small !== hira) {
    const fromSmall = pick(small)
    if (fromSmall !== undefined) return fromSmall
  }

  if (token.length === 1) {
    const ch = normalizeSmallVowel(kataToHira(normalizeDakuten(token)))
    if (t.single[ch] !== undefined) return t.single[ch]
  }
  return undefined
}

function youon4Digits(t: ReadingTables, input: string): string | null {
  const chars = [...input]
  if (chars.length !== 4) return null
  if (!SMALL_YYO.includes(chars[1])) return null
  const mid = kataToHira(chars[2])
  if (mid !== 'う' && mid !== 'ん') return null
  const head = lookup(t, chars[0] + chars[1])
  if (head === undefined) return null
  const last = lookup(t, chars[3])
  if (last === undefined) return null
  return head + last
}

function peekNextValue(t: ReadingTables, input: string, pos: number) {
  if (pos >= input.length) return undefined
  if (pos + 1 < input.length) {
    const val = lookup(t, input.slice(pos, pos + 2))
    if (val !== undefined) return val
  }
  return lookup(t, input[pos])
}

/** かな → 数字列。読めないかなを含むときは null (encode は throw する) */
export function encodeDigits(t: ReadingTables, input: string): string | null {
  const y4 = youon4Digits(t, input)
  if (y4) return y4

  let digits = ''
  let i = 0
  while (i < input.length) {
    if (isSokuon(input[i])) {
      const next = peekNextValue(t, input, i + 1)
      if (next === undefined) return null
      digits += next
      i += 1
      continue
    }
    if (i + 1 < input.length) {
      const val = lookup(t, input.slice(i, i + 2))
      if (val !== undefined) {
        digits += val
        i += 2
        continue
      }
    }
    const val = lookup(t, input[i])
    if (val === undefined) return null
    digits += val
    i += 1
  }
  return digits
}

/**
 * 数字列 → 3 桁の番号。足りなければ先頭 0 の省略 (れい = 01 → 001)、
 * 超えた分は余り (のるん の ん) として捨てる。scorer.js の targetDigits=3 と同じ扱い
 */
export function toNum(digits: string): string | null {
  if (!digits) return null
  return digits.length >= 3 ? digits.slice(0, 3) : digits.padStart(3, '0')
}

export type Reading = {
  /** 読みルールどおりに読んだ番号。読めなければ null */
  num: string | null
  /** 中間のかな 1 文字を飛ばしたときに読める番号 (rankey の !)。num と重複しない */
  omitted: string[]
}

export function readingOf(t: ReadingTables, kana: string): Reading {
  const input = kana.trim()
  if (!input) return { num: null, omitted: [] }
  const digits = encodeDigits(t, input)
  const num = digits === null ? null : toNum(digits)

  // rankey.js#findOmission と同じ範囲 (先頭と末尾は飛ばさない)
  const chars = [...input]
  const omitted: string[] = []
  for (let i = 1; i < chars.length - 1; i++) {
    const trimmed = [...chars.slice(0, i), ...chars.slice(i + 1)].join('')
    const d = encodeDigits(t, trimmed)
    const n = d === null ? null : toNum(d)
    if (n && n !== num && !omitted.includes(n)) omitted.push(n)
  }
  return { num, omitted }
}

export type ReadingCheck =
  | { status: 'empty' }
  /** 読みどおり (中間省略で合う場合も含む) */
  | { status: 'ok'; viaOmission: boolean }
  /** 読みルールでは別の番号になる。suggest が付け替え先の候補 */
  | { status: 'mismatch'; suggest: string[] }
  /** 規則表に無いかなを含む */
  | { status: 'unreadable'; suggest: string[] }

export function checkReading(
  t: ReadingTables,
  kana: string,
  num: string
): ReadingCheck {
  if (!kana.trim()) return { status: 'empty' }
  const { num: read, omitted } = readingOf(t, kana)
  if (read === num) return { status: 'ok', viaOmission: false }
  if (omitted.includes(num)) return { status: 'ok', viaOmission: true }
  const suggest = [read, ...omitted].filter((n): n is string => Boolean(n))
  return read === null
    ? { status: 'unreadable', suggest }
    : { status: 'mismatch', suggest }
}
