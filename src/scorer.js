import { encode } from './encoder.js'
import { SINGLE_TIER, normalizeDakuten, kataToHira } from './table.js'

/** スコア重み */
export const WEIGHTS = {
  core: 10,
  sub: 8,
  bad: 6,
  double: 30,
  halfOverflow: 4,
  overflowPerChar: -10,
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
  const { digits, tokens } = encode(input)

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
      return { ...t, type: 'overflow', tier: null, score: WEIGHTS.overflowPerChar }
    }
    if (!fullyIn && isDouble) {
      return { ...t, type: 'halfOverflow', tier: null, score: WEIGHTS.halfOverflow }
    }
    if (isDouble) {
      return { ...t, type: 'double', tier: null, score: WEIGHTS.double }
    }
    const tier = getTier(t.kana)
    return { ...t, type: 'single', tier, score: WEIGHTS[tier] ?? 0 }
  })

  return {
    input,
    digits,
    digitCount: digits.length,
    tokens: details,
    score: details.reduce((sum, d) => sum + d.score, 0),
  }
}
