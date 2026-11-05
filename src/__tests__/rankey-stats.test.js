import { describe, expect, it } from 'vitest'
import {
  collectRankeyStats,
  rankeyBody,
  renderRankeyStatsMarkdown,
} from '../rankey-stats.js'

const entries = [
  { num: '142', wh1: 'びょうにん', wh1k: 'びょに', wm1: '', wm1k: '' },
  { num: '142', wh1: '病人', wh1k: 'びょうに', wm1: 'ビョニ', wm1k: 'びょに' },
  { num: '476', wh1: 'シュロ', wh1k: 'しゅろ' },
  { num: '860', wh1: 'バロン', wh1k: 'ばろん', wh2: 'ゑゐ', wh2k: 'ゑゐ' },
]

describe('rankey stats', () => {
  it('takes the body before the pipe', () => {
    expect(rankeyBody('Bx~A|n')).toBe('Bx~A')
  })

  it('counts each slot by its rankey body', () => {
    const s = collectRankeyStats(entries)
    expect(s.total).toBe(6)
    expect(s.unreadable).toBe(1)
    const counts = Object.fromEntries(s.byBody.map((b) => [b.body, b.count]))
    expect(counts).toEqual({ 'Bx~A': 2, BxA: 1, AxA: 1, AAA: 1 })
    expect(s.byBody[0].body).toBe('Bx~A')
  })

  it('lists youon4 words and tells where う/ん was dropped', () => {
    const s = collectRankeyStats(entries)
    expect(s.youon4.map((y) => [y.word, y.kana, y.rk, y.kind])).toEqual([
      ['びょうにん', 'びょに', 'Bx~A|n', 'word'],
      ['病人', 'びょうに', 'Bx~A|', 'reading'],
    ])
  })

  it('renders a markdown report', () => {
    const md = renderRankeyStatsMarkdown(collectRankeyStats(entries))
    expect(md).toContain('| `Bx~A` | 2 |')
    expect(md).toContain(
      '| 142 | wh1 | びょうにん | びょに | `Bx~A\\|n` | 語の側で落とす |'
    )
  })
})
