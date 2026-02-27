import { buildReverseTable } from './table.js'

const reverseTable = buildReverseTable()

export function getKanaForDigit(digit) {
  return reverseTable[digit] ?? []
}

export function getReverseTable() {
  return reverseTable
}

/** 数字列を1桁/2桁の全分割パターンに展開 */
export function decode(digits) {
  function dfs(pos, parts, kanaOptions) {
    if (pos === digits.length) {
      return [{ parts, kanaOptions }]
    }

    const results = []

    const one = digits[pos]
    const oneKana = reverseTable[one]
    if (oneKana?.length > 0) {
      results.push(...dfs(pos + 1, [...parts, one], [...kanaOptions, oneKana]))
    }

    if (pos + 1 < digits.length) {
      const two = digits.slice(pos, pos + 2)
      const twoKana = reverseTable[two]
      if (twoKana?.length > 0) {
        results.push(
          ...dfs(pos + 2, [...parts, two], [...kanaOptions, twoKana])
        )
      }
    }

    return results
  }

  return dfs(0, [], [])
}
