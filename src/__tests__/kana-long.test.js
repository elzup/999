import { describe, expect, it } from 'vitest'
import {
  PROMPT_HEADER,
  collectLongVowelCandidates,
  longVowelCandidates,
  parseAnswers,
  planLongDb,
  planLongSheet,
  toPromptBatches,
  validateAnswers,
} from '../kana-long.js'
import { score } from '../scorer.js'

describe('longVowelCandidates', () => {
  it('お段・ょ の後ろに ｳ を足したよみを候補にする', () => {
    expect(longVowelCandidates('将棋', 'しょぎ', '449')).toEqual(['しょｳぎ'])
  })

  it('語末も候補にし、位置ごとに別の候補として出す', () => {
    expect(longVowelCandidates('正午', 'しょご', '445')).toEqual([
      'しょｳご',
      'しょごｳ',
    ])
  })

  it('候補は読む数字を変えない', () => {
    for (const c of longVowelCandidates('将棋', 'しょぎ', '449')) {
      expect(score(c).digits).toBe('449')
    }
  })

  it('もう伸ばしてある位置には足さない', () => {
    expect(longVowelCandidates('将棋', 'しょｳぎ', '449')).toEqual([])
    expect(longVowelCandidates('将棋', 'しょうぎ', '449')).toEqual([])
  })

  it('かなだけの語・空・3 桁でない番号は対象外', () => {
    expect(longVowelCandidates('ショギ', 'しょぎ', '449')).toEqual([])
    expect(longVowelCandidates('将棋', '', '449')).toEqual([])
    expect(longVowelCandidates('将棋', 'しょぎ', '1231')).toEqual([])
  })

  it('タグ付きの語も本体で見る', () => {
    expect(longVowelCandidates('将棋#g', 'しょぎ', '449')).toEqual(['しょｳぎ'])
  })
})

describe('collectLongVowelCandidates', () => {
  const entries = [
    { num: '449', wh1: '将棋', wh1k: 'しょぎ', wm1: '', wm1k: '' },
    { num: '445', wh1: 'ショゴ', wh1k: 'しょご' },
    { num: '551', wh1: '将棋', wh1k: 'しょぎ' },
  ]

  it('番号の頭で絞り、候補のある枠だけ返す', () => {
    expect(collectLongVowelCandidates(entries, ['wh1', 'wm1'], '44')).toEqual([
      {
        num: '449',
        slot: 'wh1',
        word: '将棋',
        kana: 'しょぎ',
        candidates: ['しょｳぎ'],
      },
    ])
  })
})

describe('LLM への依頼と答えの取り込み', () => {
  const rows = [
    {
      num: '449',
      slot: 'wh1',
      word: '将棋',
      kana: 'しょぎ',
      candidates: ['しょｳぎ'],
    },
    {
      num: '445',
      slot: 'wm1',
      word: '正午',
      kana: 'しょご',
      candidates: ['しょｳご', 'しょごｳ'],
    },
  ]

  it('依頼文は 1 行 1 枠のタブ区切りで、指定の行数ごとに分ける', () => {
    const batches = toPromptBatches(rows, 1)
    expect(batches).toHaveLength(2)
    expect(batches[0].startsWith(PROMPT_HEADER)).toBe(true)
    expect(batches[1]).toContain('445:wm1\t正午\tしょご\tしょｳご/しょごｳ')
  })

  it('答えは id と候補の行だけ拾う (前置きやコードブロックは捨てる)', () => {
    const text = '以下です\n```\n449:wh1\tしょｳぎ\n445:wm1  しょｳご\n```\n'
    expect(parseAnswers(text)).toEqual([
      { id: '449:wh1', to: 'しょｳぎ' },
      { id: '445:wm1', to: 'しょｳご' },
    ])
  })

  it('候補に無いよみ・知らない枠・食い違う答えは弾く', () => {
    const { accepted, rejected } = validateAnswers(
      [
        { id: '449:wh1', to: 'しょｳぎ' },
        { id: '445:wm1', to: 'しょうご' },
        { id: '999:wh1', to: 'けｳき' },
        { id: '449:wh1', to: 'しょぎｳ' },
      ],
      rows
    )
    expect(accepted).toEqual([
      { num: '449', slot: 'wh1', word: '将棋', from: 'しょぎ', to: 'しょｳぎ' },
    ])
    expect(rejected.map((r) => r.id)).toEqual(['445:wm1', '999:wh1', '449:wh1'])
  })

  const accepted = [
    { num: '449', slot: 'wh1', word: '将棋', from: 'しょぎ', to: 'しょｳぎ' },
  ]

  it('DB は今のかなが同じ枠だけ書き、他のスロットは残す', () => {
    const docs = {
      449: {
        num: '449',
        updatedAt: 'T',
        slots: {
          wh1: { word: '将棋', kana: 'しょぎ', img: 'x' },
          wm1: { kana: 'a' },
        },
      },
    }
    const [plan] = planLongDb(docs, accepted)
    expect(plan.next.slots.wh1).toEqual({
      word: '将棋',
      kana: 'しょｳぎ',
      img: 'x',
    })
    expect(plan.next.slots.wm1).toEqual({ kana: 'a' })
    expect(plan.current).toBe(docs[449])
    const stale = { 449: { ...docs[449], slots: { wh1: { kana: 'しょｳぎ' } } } }
    expect(planLongDb(stale, accepted)).toEqual([])
  })

  it('シートはかなの列のセルを番号の行で引き、今の値が同じものだけ', () => {
    const values = [
      ['num', 'wh1', 'wh1k'],
      ['448', '', ''],
      ['449', '将棋', 'しょぎ'],
    ]
    expect(planLongSheet(values, accepted)).toEqual([
      {
        cell: 'C3',
        num: '449',
        slot: 'wh1',
        before: 'しょぎ',
        after: 'しょｳぎ',
      },
    ])
    values[2][2] = 'しょうぎ'
    expect(planLongSheet(values, accepted)).toEqual([])
  })
})
