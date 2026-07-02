import { encode } from './encoder.js'
import { SINGLE_TIER, normalizeDakuten, kataToHira } from './table.js'

/**
 * スコア重み（1/10 スケール）
 * シート検索で 2 桁以上の数字が誤ヒットしないよう、旧整数点（core=10 等）を
 * すべて 1/10 にした。相対順序は不変なのでソート性は保たれる。
 */
export const WEIGHTS = {
  core: 1,
  sub: 0.8,
  bad: 0.6,
  double: 3,
  sokuon: 2,
  halfOverflow: 0.4,
  overflowPerChar: -1,
  youon4Omission: -0.5,
  leadingZeroOmission: 1.5,
  mix: -0.7,
  labelPenalty: -1,
}

/** 小数第1位に丸めて浮動小数点の桁あふれ（2.2000000000000002 等）を消す */
const round1 = (n) => Math.round(n * 10) / 10

export const LABEL_PENALTIES = {
  '-x': WEIGHTS.labelPenalty,
  '-s': WEIGHTS.labelPenalty,
  '-n': WEIGHTS.labelPenalty,
}

function isSokuon(kana) {
  return kana === 'っ' || kana === 'ッ'
}

export function getLabelPenalty(label) {
  const text = String(label || '')
  const tags = Object.keys(LABEL_PENALTIES).filter((tag) => {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    return new RegExp(`(^|\\s)${escaped}(?=\\s|#|,|$)`).test(text)
  })
  const penalty = tags.reduce((sum, tag) => sum + LABEL_PENALTIES[tag], 0)
  return { tags, penalty }
}

/** 同じ数字が異なるかなで表されているか判定（促音は除外） */
function detectMix(details) {
  const digitToKana = {}
  for (const t of details) {
    if (isSokuon(t.kana)) continue
    for (const d of t.value) {
      if (digitToKana[d] === undefined) {
        digitToKana[d] = t.kana
      } else if (digitToKana[d] !== t.kana) {
        return true
      }
    }
  }
  return false
}

/** 1桁かなのティアを取得（濁音・カタカナも正規化して判定） */
export function getTier(kana) {
  const normalized = kataToHira(normalizeDakuten(kana))
  return SINGLE_TIER[normalized] ?? null
}

/**
 * かな文字列のスコアを計算する
 * @param {string} input かな文字列
 * @param {number} targetDigits 目標桁数（デフォルト: 3）
 * @returns スコア詳細
 */
export function score(input, targetDigits = 3) {
  const { digits, tokens, youon4 } = encode(input)

  let pos = 0
  const details = tokens.map((t) => {
    const digitLen = t.value.length
    const startPos = pos
    const endPos = pos + digitLen - 1
    pos += digitLen

    const isDouble = digitLen >= 2
    const fullyIn = endPos < targetDigits
    const fullyOut = startPos >= targetDigits

    if (fullyOut) {
      return {
        ...t,
        type: 'overflow',
        tier: null,
        score: WEIGHTS.overflowPerChar,
      }
    }
    if (isSokuon(t.kana)) {
      return { ...t, type: 'sokuon', tier: null, score: WEIGHTS.sokuon }
    }
    if (!fullyIn && isDouble) {
      return {
        ...t,
        type: 'halfOverflow',
        tier: null,
        score: WEIGHTS.halfOverflow,
      }
    }
    if (isDouble) {
      return { ...t, type: 'double', tier: null, score: WEIGHTS.double }
    }
    const tier = getTier(t.kana)
    return { ...t, type: 'single', tier, score: WEIGHTS[tier] ?? 0 }
  })

  const tokenScore = details.reduce((sum, d) => sum + d.score, 0)
  const youon4Penalty = youon4 ? WEIGHTS.youon4Omission : 0
  const leadingZeroBonus =
    digits.length < targetDigits ? WEIGHTS.leadingZeroOmission : 0
  const hasMix = detectMix(details)
  const mixPenalty = hasMix ? WEIGHTS.mix : 0

  return {
    input,
    digits,
    digitCount: digits.length,
    tokens: details,
    youon4,
    leadingZeroOmission: digits.length < targetDigits,
    mix: hasMix,
    score: round1(tokenScore + youon4Penalty + leadingZeroBonus + mixPenalty),
  }
}

export function scoreWithLabel(input, label, targetDigits = 3) {
  const result = score(input, targetDigits)
  const labelPenalty = getLabelPenalty(label)
  return {
    ...result,
    labelPenalty,
    score: round1(result.score + labelPenalty.penalty),
  }
}
