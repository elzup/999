import { describe, expect, it } from 'vitest'
import { anchorTarget } from '../lib/pickPosition'

describe('anchorTarget', () => {
  const nums = ['300', '302', '310', '345']

  it('見ていた番号があればその番号', () => {
    expect(anchorTarget(nums, '302')).toBe('302')
  })

  it('無ければその次の番号 (絞り込みで消えた番号の位置を保つ)', () => {
    expect(anchorTarget(nums, '301')).toBe('302')
    expect(anchorTarget(nums, '311')).toBe('345')
  })

  it('最後より後ろなら最後の番号、空なら null', () => {
    expect(anchorTarget(nums, '399')).toBe('345')
    expect(anchorTarget([], '300')).toBeNull()
  })
})
