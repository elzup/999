const { buildReverseTable } = require('./table')

const reverseTable = buildReverseTable()

function getKanaForDigit(digit) {
  return reverseTable[digit] ?? []
}

function getReverseTable() {
  return reverseTable
}

/** 数字列を1桁/2桁の全分割パターンに展開 */
function decode(digits) {
  const results = []

  function dfs(pos, parts, kanaOptions) {
    if (pos === digits.length) {
      results.push({ parts: [...parts], kanaOptions: [...kanaOptions] })
      return
    }

    const one = digits[pos]
    const oneKana = reverseTable[one]
    if (oneKana && oneKana.length > 0) {
      dfs(pos + 1, [...parts, one], [...kanaOptions, oneKana])
    }

    if (pos + 1 < digits.length) {
      const two = digits.slice(pos, pos + 2)
      const twoKana = reverseTable[two]
      if (twoKana && twoKana.length > 0) {
        dfs(pos + 2, [...parts, two], [...kanaOptions, twoKana])
      }
    }
  }

  dfs(0, [], [])
  return results
}

module.exports = { getKanaForDigit, getReverseTable, decode }
