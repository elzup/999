import { describe, expect, it } from 'vitest'
import type { NumberDoc } from '../lib/numberApi'
import {
  decadeProgress,
  isStale,
  matchesFilter,
  pickedSlots,
  togglePick,
} from '../lib/repPicker'

const doc = (over: Partial<NumberDoc> = {}): NumberDoc => ({
  num: '051',
  slots: {
    wh1: { word: '鯉太郎', kana: 'こい' },
    wh2: { word: '小犬丸', kana: 'こいん' },
    wm1: { word: '鯉', kana: 'こい' },
  },
  rep: { picks: [], confirmed: false },
  ...over,
})

const pick = (k: string, w: string) => ({ k, w })

describe('togglePick', () => {
  it('空なら ①、次は ② に入る', () => {
    const first = togglePick(doc(), 'wm1')
    expect(first).toEqual([pick('こい', '鯉')])
    const second = togglePick(
      doc({ rep: { picks: first, confirmed: true } }),
      'wh1'
    )
    expect(second).toEqual([pick('こい', '鯉'), pick('こい', '鯉太郎')])
  })

  it('①② が埋まっていれば ② を置き換える', () => {
    const d = doc({
      rep: {
        picks: [pick('こい', '鯉'), pick('こい', '鯉太郎')],
        confirmed: true,
      },
    })
    expect(togglePick(d, 'wh2')).toEqual([
      pick('こい', '鯉'),
      pick('こいん', '小犬丸'),
    ])
  })

  it('選ばれている候補は外し、① を外すと ② が繰り上がる', () => {
    const d = doc({
      rep: {
        picks: [pick('こい', '鯉'), pick('こい', '鯉太郎')],
        confirmed: true,
      },
    })
    expect(togglePick(d, 'wm1')).toEqual([pick('こい', '鯉太郎')])
  })

  it('今の候補に当たらない古い代表は落としてから数える', () => {
    const d = doc({
      rep: {
        picks: [pick('ごい', '碁石'), pick('こい', '鯉')],
        confirmed: true,
      },
    })
    expect(togglePick(d, 'wh1')).toEqual([
      pick('こい', '鯉'),
      pick('こい', '鯉太郎'),
    ])
  })
})

describe('pickedSlots / isStale', () => {
  it('①② の順に枠を返す', () => {
    const d = doc({
      rep: {
        picks: [pick('こい', '鯉'), pick('こいん', '小犬丸')],
        confirmed: true,
      },
    })
    expect(pickedSlots(d)).toEqual(['wm1', 'wh2'])
  })

  it('候補に無い代表があれば要再確認', () => {
    expect(
      isStale(doc({ rep: { picks: [pick('ごい', '碁石')], confirmed: true } }))
    ).toBe(true)
    expect(
      isStale(doc({ rep: { picks: [pick('こい', '鯉')], confirmed: true } }))
    ).toBe(false)
  })
})

describe('matchesFilter', () => {
  const picked = (...ws: Array<[string, string]>) =>
    doc({ rep: { picks: ws.map(([k, w]) => pick(k, w)), confirmed: true } })

  it('未確定', () => {
    expect(matchesFilter(doc(), 'open')).toBe(true)
    expect(matchesFilter(picked(['こい', '鯉']), 'open')).toBe(false)
  })

  it('同種ペアは ①② が両方人か両方物', () => {
    expect(
      matchesFilter(
        picked(['こい', '鯉太郎'], ['こいん', '小犬丸']),
        'sameKind'
      )
    ).toBe(true)
    expect(
      matchesFilter(picked(['こい', '鯉太郎'], ['こい', '鯉']), 'sameKind')
    ).toBe(false)
  })

  it('物優先は ① が物', () => {
    expect(
      matchesFilter(picked(['こい', '鯉'], ['こい', '鯉太郎']), 'mono1')
    ).toBe(true)
    expect(matchesFilter(picked(['こい', '鯉太郎']), 'mono1')).toBe(false)
  })

  it('2択+ は候補が 2 つ以上', () => {
    expect(matchesFilter(doc(), 'multi')).toBe(true)
    expect(
      matchesFilter(
        doc({ slots: { wh1: { word: '鯉太郎', kana: 'こい' } } }),
        'multi'
      )
    ).toBe(false)
  })
})

describe('decadeProgress', () => {
  it('十の位ごとに確定済みの割合を出す', () => {
    const docs = [
      doc({ num: '001', rep: { picks: [], confirmed: true } }),
      doc({ num: '002' }),
      doc({ num: '095', rep: { picks: [], confirmed: true } }),
    ]
    const progress = decadeProgress(docs)
    expect(progress).toHaveLength(10)
    expect(progress[0]).toBe(0.5)
    expect(progress[9]).toBe(1)
    expect(progress[5]).toBe(0)
  })
})
