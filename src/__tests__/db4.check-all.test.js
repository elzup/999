// 毎晩の検査 (checkAll): 整合・形・旧と新の食い違いを数える
import { describe, expect, it } from 'vitest'
import { checkAll } from '../db4/check-all.js'
import { fromLegacy } from '../db4/from-legacy.js'

const slot = (word, kana = '') => ({ word, kana, imageUrl: '' })
const numbers = [
  {
    num: '106',
    hito: '',
    mono: '',
    slots: { wh1: slot('トロ'), wm1: slot('火') },
  },
]

describe('checkAll', () => {
  it('作ったばかりの新しい形は ok', () => {
    const { symbols, words } = fromLegacy({ numbers })
    const r = checkAll({ numbers, symbols, words })
    expect(r.ok).toBe(true)
    expect(r.counts).toMatchObject({
      numbers: 1,
      symbols: 1,
      words: 2,
      errors: 0,
      drift: 0,
    })
  })

  it('旧 DB だけ変わった番号は食い違い (C7) として出る', () => {
    const { symbols, words } = fromLegacy({ numbers })
    const changed = [{ ...numbers[0], slots: { wh1: slot('マイ') } }]
    const r = checkAll({ numbers: changed, symbols, words })
    expect(r.ok).toBe(false)
    expect(r.drift).toEqual(['106'])
  })

  it('語が消えていれば違反 (C1) として出る', () => {
    const { symbols, words } = fromLegacy({ numbers })
    const r = checkAll({ numbers, symbols, words: words.slice(1) })
    expect(r.ok).toBe(false)
    expect(r.errors.some((e) => e.startsWith('C1'))).toBe(true)
  })
})
