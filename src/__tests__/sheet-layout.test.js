import { describe, expect, it } from 'vitest'
import {
  FF_LAYOUT,
  MAIN_LAYOUT,
  SIDE_SLOTS,
  SLOT_KEYS,
  colIndex,
  colLetter,
  rowFormulas,
  slotColumns,
  slotHeaders,
} from '../sheet-layout.js'

describe('スロットの並び', () => {
  it('人/物ごとと、人→物でまとめた並び', () => {
    expect(SIDE_SLOTS).toEqual({
      hito: ['wh1', 'wh2', 'wh3'],
      mono: ['wm1', 'wm2', 'wm3'],
    })
    expect(SLOT_KEYS).toEqual(['wh1', 'wh2', 'wh3', 'wm1', 'wm2', 'wm3'])
  })
})

describe('FF_LAYOUT', () => {
  it('A:H を動かさず I=ng、K から 6 スロットで AH まで', () => {
    const f = rowFormulas(FF_LAYOUT, 3)
    expect(f.I).toBe('=AND(ISBLANK(F3),ISBLANK(G3),ISBLANK(H3))')
    expect(f.K).toBe('=PICK_FIRST(G3,1)')
    expect(f.O).toBe('=PICK_FIRST(H3,1)')
    expect(slotColumns(FF_LAYOUT.slotStart).at(-1).rankey).toBe('AH')
  })
})

describe('colIndex / colLetter', () => {
  it('往復する', () => {
    for (const l of ['A', 'F', 'Z', 'AA', 'AC', 'AZ', 'BA']) {
      expect(colLetter(colIndex(l))).toBe(l)
    }
    expect(colIndex('AA')).toBe(26)
  })
})

describe('MAIN_LAYOUT (999 / 1231 タブ)', () => {
  it('スロットは F から 4 列ずつ、wm3 のかなが AB', () => {
    const slots = slotColumns(MAIN_LAYOUT.slotStart)
    expect(slots[0]).toMatchObject({
      key: 'wh1',
      word: 'F',
      check: 'G',
      k: 'H',
      rankey: 'I',
    })
    expect(slots[5]).toMatchObject({
      key: 'wm3',
      word: 'Z',
      check: 'AA',
      k: 'AB',
      rankey: 'AC',
    })
  })

  it('シートに入っている式と同じものを組む', () => {
    const f = rowFormulas(MAIN_LAYOUT, 2)
    expect(f.D).toBe('=AND(ISBLANK(B2),ISBLANK(C2))')
    expect(f.F).toBe('=PICK_FIRST(B2,1)')
    expect(f.J).toBe('=PICK_FIRST(C2,1)')
    expect(f.V).toBe('=PICK_FIRST(B2,3)')
    expect(f.G).toBe(
      '=IF(OR(XOR(F2="",H2=""),NOT(OR(H2="",REGEXMATCH(H2,"^([ぁ-ゖ]|\\[[ぁ-ゖ]{1,2}\\])+$")))),"|","")'
    )
    expect(f.AA).toContain('XOR(Z2="",AB2="")')
    expect(f.H).toBeUndefined()
    expect(f.I).toBeUndefined()
  })

  it('見出しは 999 タブと同じ', () => {
    const h = slotHeaders('F')
    expect([h.F, h.G, h.H, h.I, h.J]).toEqual([
      'wh1',
      'check',
      'wh1k',
      'rankey',
      'wm1',
    ])
  })
})
