// app/lib/reading.ts は src/encoder.js の手順をアプリ用に写したもの。
// 写しがずれると編集画面が «読みが怪しい» を誤って出す (または出し損ねる) ので、
// 規則表のかなの組み合わせを総当たりで突き合わせる。
import { describe, expect, it } from 'vitest'
import { encode } from '../encoder.js'
import { findOmission } from '../rankey.js'
import {
  DOUBLE_DIGIT,
  LONG_DIGIT,
  SINGLE_DIGIT,
  SINGLE_TIER,
} from '../table.js'
import {
  checkReading,
  encodeDigits,
  readingOf,
  tablesFromRules,
} from '../../app/lib/reading.ts'

// generate-preview-data.js#buildRulesData と同じ形の rules
function buildRules() {
  const singleByDigit = {}
  for (let d = 0; d <= 9; d++) singleByDigit[d] = { core: [], sub: [], bad: [] }
  for (const [kana, digit] of Object.entries(SINGLE_DIGIT)) {
    const tier = SINGLE_TIER[kana]
    if (tier) singleByDigit[digit][tier].push(kana)
  }
  const buildMatrix = (map) => {
    const m = Array.from({ length: 10 }, () =>
      Array.from({ length: 10 }, () => [])
    )
    for (const [kana, digits] of Object.entries(map)) {
      if (digits.length !== 2) continue
      m[Number(digits[0])][Number(digits[1])].push(kana)
    }
    return m
  }
  return {
    singleByDigit,
    doubleMatrix: buildMatrix(DOUBLE_DIGIT),
    longMatrix: buildMatrix(LONG_DIGIT),
    weights: {},
  }
}

const tables = tablesFromRules(buildRules())

const reference = (kana) => {
  try {
    return encode(kana).digits
  } catch {
    return null
  }
}

const toKata = (s) =>
  [...s]
    .map((ch) => {
      const c = ch.charCodeAt(0)
      return c >= 0x3041 && c <= 0x3096 ? String.fromCharCode(c + 0x60) : ch
    })
    .join('')

// 規則表のかな + 表に無い変化形 (濁音・半濁音・小書き・促音・長音)
const units = [
  ...new Set([
    ...Object.keys(SINGLE_DIGIT),
    ...Object.keys(DOUBLE_DIGIT),
    ...Object.keys(LONG_DIGIT),
    ...'がぎぐげござじずぜぞだでどばびぶべぼぱぴぷぺぽぁぃぅぇぉっー',
    'じゃ',
    'ちゅ',
  ]),
]

describe('reading.ts と encoder.js の一致', () => {
  it('1〜2 単位の全組み合わせで同じ数字列になる', () => {
    const diffs = []
    for (const a of units) {
      for (const kana of [a, ...units.map((b) => a + b)]) {
        for (const form of [kana, toKata(kana)]) {
          const want = reference(form)
          const got = encodeDigits(tables, form)
          if (want !== got) diffs.push({ form, want, got })
        }
      }
    }
    expect(diffs.slice(0, 20)).toEqual([])
  })

  it('3〜4 単位の並びでも同じ数字列になる', () => {
    // 総当たりは多すぎるので、決まった種で並びを作る
    let seed = 1
    const next = () => (seed = (seed * 48271) % 0x7fffffff)
    const diffs = []
    for (let n = 0; n < 20000; n++) {
      const len = 3 + (next() % 2)
      let kana = ''
      for (let i = 0; i < len; i++) kana += units[next() % units.length]
      const want = reference(kana)
      const got = encodeDigits(tables, kana)
      if (want !== got) diffs.push({ kana, want, got })
    }
    expect(diffs.slice(0, 20)).toEqual([])
  })

  it('中間省略の候補は rankey.js#findOmission と同じ判定になる', () => {
    for (const [kana, num] of [
      ['りんご', '615'],
      ['ばろん', '860'],
      ['みかみ', '393'],
    ]) {
      const viaOmission = findOmission(kana, num) >= 0
      const check = checkReading(tables, kana, num)
      expect(check.status).toBe('ok')
      if (
        check.status === 'ok' &&
        viaOmission &&
        readingOf(tables, kana).num !== num
      ) {
        expect(check.viaOmission).toBe(true)
      }
    }
  })
})

describe('checkReading', () => {
  it.each([
    ['ばろん', '860', 'ok'],
    ['れい', '001', 'ok'],
    ['にいさん', '213', 'ok'],
    ['たま', '550', 'ok'],
  ])('%s は %s の読み', (kana, num, status) => {
    expect(checkReading(tables, kana, num).status).toBe(status)
  })

  it('別の番号の読みなら付け替え先を返す', () => {
    const check = checkReading(tables, 'ばろん', '123')
    expect(check).toEqual({
      status: 'mismatch',
      suggest: expect.arrayContaining(['860']),
    })
    if (check.status === 'mismatch') expect(check.suggest[0]).toBe('860')
  })

  it('表に無いかなは unreadable', () => {
    expect(checkReading(tables, 'ばろ★', '860').status).toBe('unreadable')
  })

  it('かなが空なら判定しない', () => {
    expect(checkReading(tables, '  ', '860').status).toBe('empty')
  })
})
