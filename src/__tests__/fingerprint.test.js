import { describe, expect, it } from 'vitest'
import {
  diffGroups,
  fingerprint,
  fingerprintLines,
  groupLabel,
} from '../firestore/fingerprint.js'

const form = (hito) => ({
  hito,
  mono: '火',
  wh1k: 'まい',
  wh2k: '',
  wh3k: '',
  wm1k: 'ひ',
  wm2k: '',
  wm3k: '',
})
const all = (over = {}) => ({
  ...Object.fromEntries(
    Array.from({ length: 1000 }, (_, i) => {
      const num = String(i).padStart(3, '0')
      return [num, form(`人${num}`)]
    })
  ),
  ...over,
})

describe('fingerprint', () => {
  it('100 グループ × 2 文字 = 200 文字', () => {
    expect(fingerprint(all())).toHaveLength(200)
    expect(fingerprintLines(fingerprint(all()))).toHaveLength(10)
  })

  it('同じ中身なら同じ指紋 (並び順に依らない)', () => {
    const forms = all()
    const reversed = Object.fromEntries(Object.entries(forms).reverse())
    expect(fingerprint(reversed)).toBe(fingerprint(forms))
  })

  it('1 番号の変更は、その十の位のグループだけを変える', () => {
    const a = fingerprint(all())
    const b = fingerprint(all({ 234: form('別人') }))
    expect(diffGroups(a, b)).toEqual([23])
    expect(groupLabel(23)).toBe('230-239')
  })

  it('行が無いのも食い違いとして出る', () => {
    const forms = all()
    const { 999: _, ...lacking } = forms
    expect(diffGroups(fingerprint(forms), fingerprint(lacking))).toEqual([99])
  })
})
