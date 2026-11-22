// ティアカバー (app/lib/tierCover.ts): 語の読みを格子 (2桁 / core / sub / bad + 余り) に置く。
// 表は本物 (src/table.js) から reading-parity.test.js と同じ形の rules を作って使う。

import { describe, expect, it } from 'vitest'
import {
  DOUBLE_DIGIT,
  LONG_DIGIT,
  SINGLE_DIGIT,
  SINGLE_TIER,
} from '../table.js'
import { tablesFromRules } from '../../app/lib/reading.ts'
import { buildTierCover } from '../../app/lib/tierCover.ts'

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
const entry = (num, slots) => ({ num, ...slots })

describe('buildTierCover', () => {
  it('ひふみん は sub を 3 桁通り、ん が余りになる。ヒフミ#bl はタグを除いて同じ経路', () => {
    const cover = buildTierCover(
      tables,
      entry('123', {
        wh1: 'ひふみん',
        wh1k: 'ひふみ',
        wh2: 'ヒフミ#bl',
        wh2k: 'ひふみ',
      })
    )
    const sub = [0, 1, 2].map((col) => ({ row: 'sub', col }))
    expect(cover.words).toEqual([
      { slot: 'wh1', word: 'ひふみん', kind: 'h', nodes: sub, rest: 'ん' },
      { slot: 'wh2', word: 'ヒフミ', kind: 'h', nodes: sub, rest: '' },
    ])
  })

  it('2桁読みは またぐ 2 桁の左の列に置き、2 段の上の行に並べる。bad は誰も通らなければ畳む', () => {
    const cover = buildTierCover(tables, entry('123', { wm1: 'てぃさ' }))
    expect(cover.words[0].nodes).toEqual([
      { row: 'd0', col: 0 },
      { row: 'core', col: 2 },
    ])
    expect(cover.rows).toEqual(['d0', 'd1', 'core', 'sub'])
    expect(cover.cells.find((c) => c.row === 'd1')).toMatchObject({
      col: 1,
      span: 2,
      kana: 'つ',
    })
  })

  it('語がかなで読めなければヨミを使う。読めない語は出さない', () => {
    const cover = buildTierCover(
      tables,
      entry('123', { wh1: '一二三', wh1k: 'ひふみ', wm1: '無理' })
    )
    expect(cover.words.map((w) => w.word)).toEqual(['一二三'])
  })

  it('3 桁に満たない読みは先頭の 0 を省いたものとして右に寄せる', () => {
    const cover = buildTierCover(tables, entry('012', { wh1: 'いに' }))
    expect(cover.words[0].nodes).toEqual([
      { row: 'core', col: 1 },
      { row: 'core', col: 2 },
    ])
  })
})
