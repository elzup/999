import { describe, it, expect } from 'vitest'
import { layoutYomi, placeYomi } from '../lib/yomiLayout'
import type { YomiItem } from '../lib/yomiDrill'

const item = (kana: string, kind: YomiItem['kind'] = 'youon'): YomiItem => ({
  kana,
  digits: '00',
  kind,
  uses: [],
  nums: [],
})
const kanaOf = (cells: (YomiItem | null)[]) => cells.map((c) => c?.kana ?? '')

describe('placeYomi', () => {
  it('拗音は頭のかなの行、小書きの段に置く', () => {
    expect(placeYomi('ちょ')).toMatchObject({ label: 'ち', col: 4 })
    expect(placeYomi('ひゃ')).toMatchObject({ label: 'ひ', col: 0 })
  })
  it('外来音 (ぁぃぅぇぉ) も同じ規則', () => {
    expect(placeYomi('てぃ')).toMatchObject({ label: 'て', col: 1 })
    expect(placeYomi('ふぇ')).toMatchObject({ label: 'ふ', col: 3 })
  })
  it('長音は行 (か行 等) にまとめ、頭のかなの段に置く', () => {
    expect(placeYomi('きー')).toMatchObject({ label: 'か行', col: 1 })
    expect(placeYomi('よー')).toMatchObject({ label: 'や行', col: 4 })
  })
  it('置けない並びは null', () => {
    expect(placeYomi('しん')).toBeNull()
  })
})

describe('layoutYomi', () => {
  it('行は五十音順、空いた段は null で位置を保つ', () => {
    const { rows } = layoutYomi(
      ['ちゃ', 'きゅ', 'ちょ', 'しゃ'].map((k) => item(k))
    )
    expect(rows.map((r) => r.label)).toEqual(['き', 'し', 'ち'])
    expect(kanaOf(rows[2].cells)).toEqual(['ちゃ', '', '', '', 'ちょ'])
  })
  it('長音は行ごとに 1 行', () => {
    const { rows } = layoutYomi(
      ['くー', 'かー', 'こー', 'さー'].map((k) => item(k, 'long'))
    )
    expect(rows.map((r) => r.label)).toEqual(['か行', 'さ行'])
    expect(kanaOf(rows[0].cells)).toEqual(['かー', '', 'くー', '', 'こー'])
  })
  it('同じ段に 2 つ来たら行を分けて両方見せる', () => {
    const { rows } = layoutYomi(['ちゃ', 'ちゃ'].map((k) => item(k)))
    expect(rows).toHaveLength(2)
  })
  it('置けないものは unplaced に回す (落とさない)', () => {
    const { rows, unplaced } = layoutYomi([item('しん'), item('しゃ')])
    expect(rows).toHaveLength(1)
    expect(unplaced.map((u) => u.kana)).toEqual(['しん'])
  })
})
