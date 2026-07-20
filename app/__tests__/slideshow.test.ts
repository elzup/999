import { describe, it, expect } from 'vitest'
import {
  advance,
  canGoBack,
  currentId,
  goBack,
  initSlide,
  HISTORY_CAP,
  MAX_BACK,
  SLIDE_SPEEDS,
} from '../lib/slideshow'

const POOL = ['000', '111', '222', '333', '444', '555', '666', '777']

describe('slideshow logic', () => {
  it('順番モードはプール順に進む', () => {
    let s = initSlide(POOL, 'order')
    expect(currentId(s)).toBe('000')
    s = advance(s, POOL, 'order')
    expect(currentId(s)).toBe('111')
    s = advance(s, POOL, 'order')
    expect(currentId(s)).toBe('222')
  })

  it('順番モードは末尾で先頭へ折り返す', () => {
    let s = initSlide(['00', '01'], 'order')
    s = advance(s, ['00', '01'], 'order') // 01
    s = advance(s, ['00', '01'], 'order') // 折り返して 00
    expect(currentId(s)).toBe('00')
  })

  it('戻るは最大5個 (履歴6件) まで保持する', () => {
    let s = initSlide(POOL, 'order')
    // 000 から 7回進めて 700... ではなく 7要素なので順に進む
    for (let i = 0; i < 7; i++) s = advance(s, POOL, 'order')
    expect(s.history.length).toBe(HISTORY_CAP)
    // 現在から MAX_BACK 回戻れる
    let backs = 0
    while (canGoBack(s)) {
      s = goBack(s)
      backs++
    }
    expect(backs).toBe(MAX_BACK)
  })

  it('戻ってから次へは記憶済み履歴を前進する (新規生成しない)', () => {
    let s = initSlide(POOL, 'order') // 000
    s = advance(s, POOL, 'order') // 111
    s = advance(s, POOL, 'order') // 222
    const at222 = currentId(s)
    s = goBack(s) // 111
    expect(currentId(s)).toBe('111')
    s = advance(s, POOL, 'order') // 記憶済みの 222 に戻る
    expect(currentId(s)).toBe(at222)
  })

  it('先頭では戻れない', () => {
    const s = initSlide(POOL, 'order')
    expect(canGoBack(s)).toBe(false)
    expect(goBack(s)).toBe(s)
  })

  it('ランダムモードは直前と同じを避ける', () => {
    // rand をカウンタで固定し決定的にする
    let calls = 0
    const seq = [0, 0, 0.5, 0.5, 0.9]
    const rand = () => seq[calls++ % seq.length]
    let s = initSlide(POOL, 'random', rand)
    const first = currentId(s)
    s = advance(s, POOL, 'random', rand)
    expect(currentId(s)).not.toBe(first)
  })

  it('空プールは安全に扱える', () => {
    let s = initSlide([], 'order')
    expect(currentId(s)).toBeNull()
    s = advance(s, [], 'order')
    expect(currentId(s)).toBeNull()
    expect(canGoBack(s)).toBe(false)
  })

  it('速度は3段階', () => {
    expect(SLIDE_SPEEDS).toHaveLength(3)
    expect(SLIDE_SPEEDS[0]).toBeGreaterThan(SLIDE_SPEEDS[2])
  })
})
