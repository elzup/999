import { describe, expect, it } from 'vitest'
import { formatBytes, timeAgo } from '../lib/format'

describe('formatBytes', () => {
  it('単位を大きさに合わせて切り替える', () => {
    expect(formatBytes(null)).toBe('-')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatBytes(10242.43 * 1024 * 1024)).toBe('10.0 GB')
  })
})

describe('timeAgo', () => {
  const now = new Date('2026-11-12T10:00:00+09:00')
  const before = (ms: number) => new Date(now.getTime() - ms)

  it('経過時間を分・時間・日で出す', () => {
    expect(timeAgo(before(30 * 1000), now)).toBe('たった今')
    expect(timeAgo(before(5 * 60 * 1000), now)).toBe('5 分前')
    expect(timeAgo(before(13 * 60 * 60 * 1000), now)).toBe('13 時間前')
    expect(timeAgo(before(3 * 24 * 60 * 60 * 1000), now)).toBe('3 日前')
  })

  it('未来の時刻 (端末の時計ずれ) は «たった今»', () => {
    expect(timeAgo(before(-60 * 1000), now)).toBe('たった今')
  })
})
