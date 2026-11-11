import { describe, it, expect, vi } from 'vitest'
import { navAround } from '../lib/useSelection'

describe('navAround (詳細パネルの前へ / 次へ)', () => {
  const order = ['010', '011', '012']

  it('前後の番号へ送り、ボタンには行き先を出す', () => {
    const go = vi.fn()
    const nav = navAround(order, '011', go)
    expect(nav.prevLabel).toBe('010')
    expect(nav.nextLabel).toBe('012')
    nav.onNext?.()
    expect(go).toHaveBeenCalledWith('012')
    nav.onPrev?.()
    expect(go).toHaveBeenCalledWith('010')
  })

  it('端では押せない (null)', () => {
    expect(navAround(order, '010', vi.fn()).onPrev).toBeNull()
    expect(navAround(order, '012', vi.fn()).onNext).toBeNull()
  })

  it('並びから外れた (★を外した等) ときは次へで先頭に戻る', () => {
    const go = vi.fn()
    const nav = navAround(order, '999', go)
    expect(nav.onPrev).toBeNull()
    nav.onNext?.()
    expect(go).toHaveBeenCalledWith('010')
  })

  it('ラベルは labelOf で変えられる', () => {
    const nav = navAround(['0101', '0102'], '0101', vi.fn(), (k) => 'd' + k)
    expect(nav.nextLabel).toBe('d0102')
  })
})
