const {
  SINGLE_DIGIT,
  DOUBLE_DIGIT,
  normalizeDakuten,
  kataToHira,
} = require('./table')

function lookup(token) {
  if (DOUBLE_DIGIT[token] !== undefined) return DOUBLE_DIGIT[token]

  const normalized = normalizeDakuten(token)
  if (DOUBLE_DIGIT[normalized] !== undefined) return DOUBLE_DIGIT[normalized]

  const hira = [...normalized].map(kataToHira).join('')
  if (DOUBLE_DIGIT[hira] !== undefined) return DOUBLE_DIGIT[hira]

  if (token.length === 1) {
    const ch = kataToHira(normalizeDakuten(token))
    if (SINGLE_DIGIT[ch] !== undefined) return String(SINGLE_DIGIT[ch])
  }

  return undefined
}

/** かな文字列 → { digits, tokens } */
function encode(input) {
  const tokens = []
  let i = 0

  while (i < input.length) {
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
  return { digits, tokens }
}

function countDigits(input) {
  return encode(input).digits.length
}

function isThreeDigits(input) {
  const { digits } = encode(input)
  return digits.length === 3 && digits[0] !== '0'
}

module.exports = { encode, countDigits, isThreeDigits }
