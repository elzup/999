const {
  SINGLE_DIGIT,
  DOUBLE_DIGIT,
  normalizeDakuten,
  kataToHira,
} = require('./table')

const GOJUON = [
  'あ',
  'い',
  'う',
  'え',
  'お',
  'か',
  'き',
  'く',
  'け',
  'こ',
  'さ',
  'し',
  'す',
  'せ',
  'そ',
  'た',
  'ち',
  'つ',
  'て',
  'と',
  'な',
  'に',
  'ぬ',
  'ね',
  'の',
  'は',
  'ひ',
  'ふ',
  'へ',
  'ほ',
  'ま',
  'み',
  'む',
  'め',
  'も',
  'や',
  'ゆ',
  'よ',
  'ら',
  'り',
  'る',
  'れ',
  'ろ',
  'わ',
  'を',
]

const DAKUON = [
  'が',
  'ぎ',
  'ぐ',
  'げ',
  'ご',
  'ざ',
  'じ',
  'ず',
  'ぜ',
  'ぞ',
  'だ',
  'ぢ',
  'づ',
  'で',
  'ど',
  'ば',
  'び',
  'ぶ',
  'べ',
  'ぼ',
]

const HANDAKUON = ['ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ']

const YOUON_BASE = ['き', 'し', 'ち', 'に', 'ひ', 'み', 'り']
const YOUON_SUFFIXES = ['ゃ', 'ゅ', 'ょ']

const JA_JU_JO = ['ジャ', 'ジュ', 'ジョ']

function hiraToKata(ch) {
  const code = ch.charCodeAt(0)
  if (code >= 0x3041 && code <= 0x3096) return String.fromCharCode(code + 0x60)
  return ch
}

function lookupValue(kana) {
  if (DOUBLE_DIGIT[kana] !== undefined) return DOUBLE_DIGIT[kana]
  if (SINGLE_DIGIT[kana] !== undefined) return String(SINGLE_DIGIT[kana])

  const kata = [...kana].map(hiraToKata).join('')
  if (DOUBLE_DIGIT[kata] !== undefined) return DOUBLE_DIGIT[kata]

  const hira = [...kana].map(kataToHira).join('')
  if (DOUBLE_DIGIT[hira] !== undefined) return DOUBLE_DIGIT[hira]
  if (SINGLE_DIGIT[hira] !== undefined) return String(SINGLE_DIGIT[hira])

  return null
}

function checkKana(kana, note) {
  const value = lookupValue(kana)
  return {
    kana,
    covered: value !== null,
    value,
    note: note
      ? note(kana, value)
      : value !== null
      ? `${kana}→${value}`
      : '未対応',
  }
}

function generateCoverage() {
  const gojuon = GOJUON.map((k) => checkKana(k, null))

  const dakuon = DAKUON.map((k) => {
    const seion = normalizeDakuten(k)
    const value = lookupValue(seion)
    return {
      kana: k,
      covered: value !== null,
      value,
      note: value !== null ? `${k}→${seion}→${value}` : '未対応',
    }
  })

  const handakuon = HANDAKUON.map((k) => {
    const seion = normalizeDakuten(k)
    const value = lookupValue(seion)
    return {
      kana: k,
      covered: value !== null,
      value,
      note: value !== null ? `${k}→${seion}→${value}` : '未対応',
    }
  })

  const youon = YOUON_BASE.flatMap((base) =>
    YOUON_SUFFIXES.map((suffix) => checkKana(base + suffix, null))
  )

  const exceptions = JA_JU_JO.map((k) => {
    const value = lookupValue(k)
    return {
      kana: k,
      covered: value !== null,
      value,
      note:
        value !== null ? `${k}→${value} (濁音例外: リャ行と同じ)` : '未対応',
    }
  })

  const entries = [...gojuon, ...dakuon, ...handakuon, ...youon, ...exceptions]
  const total = entries.length
  const covered = entries.filter((e) => e.covered).length

  return {
    gojuon,
    dakuon,
    handakuon,
    youon,
    exceptions,
    summary: { total, covered, rate: Math.round((covered / total) * 100) },
  }
}

module.exports = { generateCoverage }
