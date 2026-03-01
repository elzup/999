import {
  SINGLE_DIGIT,
  DOUBLE_DIGIT,
  LONG_DIGIT,
  normalizeDakuten,
  kataToHira,
  normalizeSmallVowel,
} from './table.js'

function isSokuon(ch) {
  return ch === 'っ' || ch === 'ッ'
}

// prettier-ignore
const SMALL_YYO = ['ゃ', 'ゅ', 'ょ', 'ャ', 'ュ', 'ョ']

/** 拗音4ルール: ○(ゃ|ゅ|ょ)(う|ん)○ → う/んを省略して3桁にする */
function detectYouon4(input) {
  const chars = [...input]
  if (chars.length !== 4) return null
  if (!SMALL_YYO.includes(chars[1])) return null
  const mid = kataToHira(chars[2])
  if (mid !== 'う' && mid !== 'ん') return null
  const youon = chars[0] + chars[1]
  const youonVal = lookup(youon)
  if (youonVal === undefined) return null
  const lastVal = lookup(chars[3])
  if (lastVal === undefined) return null
  return {
    tokens: [
      { kana: youon, value: youonVal },
      { kana: chars[3], value: lastVal },
    ],
    digits: youonVal + lastVal,
  }
}

/** 位置 pos から次トークンの value を先読みする */
function peekNextValue(input, pos) {
  if (pos >= input.length) return undefined
  if (pos + 1 < input.length) {
    const two = input.slice(pos, pos + 2)
    const val = lookup(two)
    if (val !== undefined) return val
  }
  return lookup(input[pos])
}

function lookup(token) {
  if (DOUBLE_DIGIT[token] !== undefined) return DOUBLE_DIGIT[token]
  if (LONG_DIGIT[token] !== undefined) return LONG_DIGIT[token]

  const normalized = normalizeDakuten(token)
  if (DOUBLE_DIGIT[normalized] !== undefined) return DOUBLE_DIGIT[normalized]
  if (LONG_DIGIT[normalized] !== undefined) return LONG_DIGIT[normalized]

  const hira = [...normalized].map(kataToHira).join('')
  if (DOUBLE_DIGIT[hira] !== undefined) return DOUBLE_DIGIT[hira]
  if (LONG_DIGIT[hira] !== undefined) return LONG_DIGIT[hira]

  const small = normalizeSmallVowel(hira)
  if (small !== hira) {
    if (DOUBLE_DIGIT[small] !== undefined) return DOUBLE_DIGIT[small]
    if (LONG_DIGIT[small] !== undefined) return LONG_DIGIT[small]
  }

  if (token.length === 1) {
    const ch = normalizeSmallVowel(kataToHira(normalizeDakuten(token)))
    if (SINGLE_DIGIT[ch] !== undefined) return String(SINGLE_DIGIT[ch])
  }

  return undefined
}

/** かな文字列 → { digits, tokens, youon4 } */
export function encode(input) {
  const y4 = detectYouon4(input)
  if (y4) return { ...y4, youon4: true }

  const tokens = []
  let i = 0

  while (i < input.length) {
    if (isSokuon(input[i])) {
      const nextVal = peekNextValue(input, i + 1)
      if (nextVal === undefined) {
        throw new Error(`促音 at position ${i} has no following kana`)
      }
      tokens.push({ kana: input[i], value: nextVal })
      i += 1
      continue
    }

    if (i + 1 < input.length) {
      const two = input.slice(i, i + 2)
      const val = lookup(two)
      if (val !== undefined) {
        tokens.push({ kana: two, value: val })
        i += 2
        continue
      }
    }

    const one = input[i]
    const val = lookup(one)
    if (val === undefined) {
      throw new Error(`Unknown kana: "${one}" at position ${i}`)
    }
    tokens.push({ kana: one, value: val })
    i += 1
  }

  const digits = tokens.map((t) => t.value).join('')
  return { digits, tokens, youon4: false }
}

export function countDigits(input) {
  return encode(input).digits.length
}

export function isThreeDigits(input) {
  const { digits } = encode(input)
  return digits.length === 3 && digits[0] !== '0'
}
