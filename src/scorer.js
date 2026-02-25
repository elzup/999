const { encode } = require('./encoder')
const { SINGLE_TIER, normalizeDakuten, kataToHira } = require('./table')

/** スコア重み（デフォルト） */
const WEIGHTS = {
  core: 2,
  sub: -1,
  bad: -2,
  double: 1,
  overflowPerDigit: -3,
  underflowPerDigit: -3,
}

/** 1桁かなのティアを取得（濁音・カタカナも正規化して判定） */
function getTier(kana) {
  const normalized = kataToHira(normalizeDakuten(kana))
  return SINGLE_TIER[normalized] ?? null
}

/**
 * かな文字列のスコアを計算する
 * @param {string} input かな文字列
 * @param {number} targetDigits 目標桁数（デフォルト: 3）
 * @returns スコア詳細
 */
function score(input, targetDigits = 3) {
  const { digits, tokens } = encode(input)

  const details = tokens.map((t) => {
    const isDouble = t.value.length >= 2
    if (isDouble) {
      return { ...t, type: 'double', tier: null, score: WEIGHTS.double }
    }
    const tier = getTier(t.kana)
    return { ...t, type: 'single', tier, score: WEIGHTS[tier] ?? 0 }
  })

  const tokenScore = details.reduce((sum, d) => sum + d.score, 0)

  const diff = digits.length - targetDigits
  const overflow = Math.max(0, diff)
  const underflow = Math.max(0, -diff)
  let digitPenalty = 0
  if (overflow > 0) digitPenalty += overflow * WEIGHTS.overflowPerDigit
  if (underflow > 0) digitPenalty += underflow * WEIGHTS.underflowPerDigit

  return {
    input,
    digits,
    digitCount: digits.length,
    tokens: details,
    overflow,
    underflow,
    digitPenalty,
    score: tokenScore + digitPenalty,
  }
}

module.exports = { score, getTier, WEIGHTS }
