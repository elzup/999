import { describe, expect, it } from 'vitest'
import {
  containSize,
  cropImageStyle,
  matchingPreset,
  moveRect,
  presetRect,
  resizeRect,
  scaleOf,
  squareAt,
} from '../lib/cropRect'

const wide = { width: 800, height: 400 }
const tall = { width: 300, height: 900 }
const POSITIONS = ['top', 'bottom', 'left', 'right', 'centre'] as const

describe('切り抜きの範囲', () => {
  it('寄せ方は短い辺いっぱいの正方形を sharp と同じ所に置く', () => {
    expect(presetRect(wide, 'left')).toEqual({ x: 0, y: 0, w: 0.5, h: 1 })
    expect(presetRect(wide, 'right')).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 })
    expect(presetRect(wide, 'centre')).toEqual({ x: 0.25, y: 0, w: 0.5, h: 1 })
    expect(presetRect(tall, 'top')).toEqual({ x: 0, y: 0, w: 1, h: 1 / 3 })
    expect(presetRect(tall, 'bottom').y).toBeCloseTo(2 / 3)
  })

  it('画素で正方形になる', () => {
    const r = squareAt(wide, 0.5, 0.5, 0.5)
    expect(r.w * wide.width).toBeCloseTo(r.h * wide.height)
    expect(scaleOf(wide, r)).toBeCloseTo(0.5)
  })

  it('動かしても大きくしても元画像からはみ出さない', () => {
    const r = moveRect(presetRect(wide, 'centre'), 1, 1)
    expect(r).toEqual({ x: 0.5, y: 0, w: 0.5, h: 1 })
    const small = squareAt(wide, 0.4, 0.95, 0.95)
    expect(small.x + small.w).toBeLessThanOrEqual(1)
    expect(small.y + small.h).toBeLessThanOrEqual(1)
    expect(scaleOf(wide, resizeRect(wide, small, 3))).toBeCloseTo(1)
    expect(scaleOf(wide, resizeRect(wide, small, 0))).toBeCloseTo(0.2)
  })

  it('寄せ方のボタンで置いた範囲ならその寄せ方を返す', () => {
    expect(
      matchingPreset(wide, presetRect(wide, 'right'), [...POSITIONS])
    ).toBe('right')
    // 縦長の上寄せは左右どちらにも当たる (幅いっぱい)。先に並ぶ方
    expect(matchingPreset(tall, presetRect(tall, 'top'), [...POSITIONS])).toBe(
      'top'
    )
    expect(
      matchingPreset(wide, squareAt(wide, 0.5, 0.3, 0.3), [...POSITIONS])
    ).toBe(null)
  })

  it('結果の箱に元画像を置く位置', () => {
    expect(cropImageStyle({ x: 0.5, y: 0, w: 0.5, h: 1 })).toMatchObject({
      width: '200%',
      height: '100%',
      left: '-100%',
      top: '0%',
    })
  })

  it('contain で収める大きさ', () => {
    expect(containSize({ width: 400, height: 400 }, wide)).toEqual({
      width: 400,
      height: 200,
    })
  })
})
