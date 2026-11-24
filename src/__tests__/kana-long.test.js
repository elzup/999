import { describe, expect, it } from 'vitest'
import {
  collectLongVowelCandidates,
  longVowelCandidates,
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
