import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data')

function loadTsv(filename) {
  return readFileSync(join(dataDir, filename), 'utf-8').trimEnd()
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

const VALID_TIERS = ['core', 'sub', 'bad']

function assertSingleKana(kana) {
  if ([...kana].length !== 1) {
    throw new Error(`Expected single kana, got "${kana}"`)
  }
}

function assertDigit(value, context) {
  const n = Number(value)
  if (!Number.isInteger(n) || n < 0 || n > 9) {
    throw new Error(`Invalid digit "${value}" (${context})`)
  }
  return n
}

function assertTier(tier, kana) {
  if (!VALID_TIERS.includes(tier)) {
    throw new Error(`Invalid tier "${tier}" for kana "${kana}"`)
  }
}

function assertKanaLength(kana, row, col) {
  const len = [...kana].length
  if (len < 1 || len > 2) {
    throw new Error(`Invalid kana "${kana}" at [${row}][${col}]`)
  }
}

// ---------------------------------------------------------------------------
// TSV parsers
// ---------------------------------------------------------------------------

function parseSingleDigitTsv(tsv) {
  const singleDigit = {}
  const singleTier = {}
  const lines = tsv
    .split('\n')
    .filter((l) => l.trim() !== '' && !l.startsWith('#'))

  const header = lines[0].split('\t')
  const cols = header.slice(1).map((v) => assertDigit(v, 'column header'))

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split('\t')
    const tier = cells[0].trim()
    assertTier(tier, `row ${i}`)

    for (let j = 1; j < cells.length; j++) {
      const kana = cells[j]?.trim()
      if (!kana) continue

      assertSingleKana(kana)
      const digit = cols[j - 1]

      singleDigit[kana] = digit
      singleTier[kana] = tier
    }
  }

  return { singleDigit, singleTier }
}

function parseDoubleDigitTsv(tsv) {
  const doubleDigit = {}
  const lines = tsv
    .split('\n')
    .filter((l) => l.trim() !== '' && !l.startsWith('#'))

  const header = lines[0].split('\t')
  const cols = header.slice(1).map((v) => assertDigit(v, 'column header'))

  for (let i = 1; i < lines.length; i++) {
    const cells = lines[i].split('\t')
    const row = assertDigit(cells[0], 'row header')

    for (let j = 1; j < cells.length; j++) {
      const cell = cells[j]?.trim()
      if (!cell) continue

      const col = cols[j - 1]
      const digits = `${row}${col}`

      for (const kana of cell.split('/')) {
        const k = kana.trim()
        if (!k) continue
        assertKanaLength(k, row, col)
        doubleDigit[k] = digits
      }
    }
  }

  return doubleDigit
}

// ---------------------------------------------------------------------------
// Load data
// ---------------------------------------------------------------------------

const { singleDigit, singleTier } = parseSingleDigitTsv(
  loadTsv('single_digit.tsv')
)

export const SINGLE_DIGIT = singleDigit
export const SINGLE_TIER = singleTier
export const DOUBLE_DIGIT = parseDoubleDigitTsv(loadTsv('double_digit.tsv'))
export const LONG_DIGIT = parseDoubleDigitTsv(loadTsv('long_digit.tsv'))

// ---------------------------------------------------------------------------
// Dakuten normalization (code-defined, not data)
// ---------------------------------------------------------------------------

// prettier-ignore
const DAKUTEN_MAP = {
  // ひらがな濁音
  が:'か', ぎ:'き', ぐ:'く', げ:'け', ご:'こ',
  ざ:'さ', じ:'し', ず:'す', ぜ:'せ', ぞ:'そ',
  だ:'た', ぢ:'ち', づ:'つ', で:'て', ど:'と',
  ば:'は', び:'ひ', ぶ:'ふ', べ:'へ', ぼ:'ほ',
  // ひらがな半濁音
  ぱ:'は', ぴ:'ひ', ぷ:'ふ', ぺ:'へ', ぽ:'ほ',
  // カタカナ濁音
  ガ:'か', ギ:'き', グ:'く', ゲ:'け', ゴ:'こ',
  ザ:'さ', ジ:'し', ズ:'す', ゼ:'せ', ゾ:'そ',
  ダ:'た', ヂ:'ち', ヅ:'つ', デ:'て', ド:'と',
  バ:'は', ビ:'ひ', ブ:'ふ', ベ:'へ', ボ:'ほ',
  // カタカナ半濁音
  パ:'は', ピ:'ひ', プ:'ふ', ペ:'へ', ポ:'ほ',
}

// prettier-ignore
const DAKUTEN_YOUON_EXCEPTIONS = {
  じゃ:'じゃ', じゅ:'じゅ', じょ:'じょ',
  ジャ:'ジャ', ジュ:'ジュ', ジョ:'ジョ',
}

/** カタカナ→ひらがな (基本50音) */
const KATA_TO_HIRA = Object.fromEntries(
  Array.from({ length: 0x30f6 - 0x30a1 + 1 }, (_, i) => {
    const code = 0x30a1 + i
    return [String.fromCharCode(code), String.fromCharCode(code - 0x60)]
  })
)

// ---------------------------------------------------------------------------
// Exported helpers
// ---------------------------------------------------------------------------

export function normalizeDakuten(token) {
  if (DAKUTEN_YOUON_EXCEPTIONS[token]) return token
  return [...token].map((ch) => DAKUTEN_MAP[ch] ?? ch).join('')
}

export function kataToHira(ch) {
  return KATA_TO_HIRA[ch] ?? ch
}

export function buildReverseTable() {
  const addEntry = (acc, key, kana) => ({
    ...acc,
    [key]: [...(acc[key] ?? []), kana],
  })

  const fromSingle = Object.entries(SINGLE_DIGIT).reduce(
    (acc, [kana, digit]) => addEntry(acc, String(digit), kana),
    {}
  )

  const fromDouble = Object.entries(DOUBLE_DIGIT).reduce(
    (acc, [kana, digits]) => addEntry(acc, digits, kana),
    fromSingle
  )

  return Object.entries(LONG_DIGIT).reduce(
    (acc, [kana, digits]) => addEntry(acc, digits, kana),
    fromDouble
  )
}
