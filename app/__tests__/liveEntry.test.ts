import { describe, expect, it } from 'vitest'
import { parseNumberEntry, withNumberEntry } from '../lib/liveEntry'
import type { AppData } from '../data/schema'

const entry = (num: string, w1: string) =>
  parseNumberEntry({ num, w1, w1k: 'あ', wh1: w1, wh1k: 'あ' })!

const dataOf = (...numbers: ReturnType<typeof entry>[]) =>
  ({ numbers, cards: [] }) as unknown as AppData

describe('withNumberEntry', () => {
  it('同じ番号の 1 件だけ差し替える', () => {
    const other = entry('002', 'イ')
    const data = dataOf(entry('001', 'ア'), other)
    const next = withNumberEntry(data, entry('001', 'ウ'))
    expect(next.numbers[0].w1).toBe('ウ')
    expect(next.numbers[1]).toBe(other)
    // 元のデータは書き換えない
    expect(data.numbers[0].w1).toBe('ア')
  })

  it('無い番号・同じ中身なら元のデータを返す (再描画させない)', () => {
    const data = dataOf(entry('001', 'ア'))
    expect(withNumberEntry(data, entry('009', 'ア'))).toBe(data)
    expect(withNumberEntry(data, entry('001', 'ア'))).toBe(data)
  })
})

describe('parseNumberEntry', () => {
  it('形が合わない応答は null', () => {
    expect(parseNumberEntry({ num: 'abc' })).toBeNull()
    expect(parseNumberEntry(undefined)).toBeNull()
  })
})

describe('withDocView (保存待ちの編集をすぐ辞書データに映す)', () => {
  it('語・かな・画像・代表を新旧両方の名前に映す。文書に画像が無い枠は今の画像のまま', async () => {
    const { withDocView } = await import('../lib/liveEntry')
    const entry = {
      num: '531',
      wh1: '古い',
      w1: '古い',
      wh1Img: 'old.webp',
      w1Img: 'old.webp',
    } as unknown as Parameters<typeof withDocView>[0]
    const out = withDocView(entry, {
      num: '531',
      slots: {
        wh1: { word: 'コミー#tri', kana: 'こみー' },
        wm1: { word: '物', kana: 'もの', imageUrl: 'm.webp' },
      },
      rep: { picks: [{ k: 'こみー', w: 'コミー#tri' }], confirmed: false },
    }) as unknown as Record<string, unknown>
    expect(out).toMatchObject({
      wh1: 'コミー#tri',
      w1: 'コミー#tri',
      wh1k: 'こみー',
      w1k: 'こみー',
      wh1Img: 'old.webp',
      wm1: '物',
      w2: '物',
      wm1Img: 'm.webp',
      w2Img: 'm.webp',
      wh3: '',
      rep: { picks: [{ k: 'こみー', w: 'コミー#tri' }], confirmed: false },
    })
  })
})
