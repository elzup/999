import { describe, expect, it } from 'vitest'
import { buildNumberDoc } from '../firestore/number-doc.js'
import {
  entryWithDoc,
  isDocReflected,
  numbersWithDocs,
  scoreFields,
} from '../firestore/app-entry.js'
import { categoryScore, normalizeWordEntry } from '../words.js'
import { scoreWithLabel } from '../scorer.js'

const NOW = '2026-11-18T00:00:00.000Z'

/** words.tsv の 1 行 → 配信データの 1 件 (generate-viz と同じ組み立て) */
function deliveredOf(row, images = {}) {
  const base = normalizeWordEntry(row)
  return { ...base, ...categoryScore(base), ...scoreFields(base), ...images }
}

const row = {
  num: '001',
  hito: 'ボブ,チャーリー,デイブ,イブ',
  mono: '犬',
  gainen: '',
  wh1: 'ボブ',
  wh1k: 'ぼぶ',
  wh2: 'チャーリー',
  wh2k: 'ちゃーりー',
  wh3: 'デイブ',
  wh3k: 'でいぶ',
  wm1: '犬',
  wm1k: 'いぬ',
}

/** シート同期が作るのと同じ文書 */
const docOf = (word) => buildNumberDoc({ word, source: 'sheet', now: NOW })

describe('entryWithDoc', () => {
  it('配信データにもう入っている文書なら、同じ 1 件をそのまま返す', () => {
    const entry = deliveredOf(row)
    expect(isDocReflected(entry, docOf(row))).toBe(true)
    expect(entryWithDoc(entry, docOf(row))).toBe(entry)
  })

  it('語・かなを直した文書を重ねると、deploy で作り直したのと同じになる', () => {
    const entry = deliveredOf(row, { w1Img: 'https://img/1.webp' })
    const edited = {
      ...row,
      hito: 'ボビー,チャーリー,デイブ,イブ',
      wh1: 'ボビー',
      wh1k: 'ぼびー',
    }
    const next = entryWithDoc(entry, docOf(edited))

    const rebuilt = deliveredOf(edited)
    for (const key of [
      'w1',
      'w1k',
      'wh1',
      'wh1k',
      'hito',
      'mono',
      'w1Score',
      'w1Pattern',
      'catScore',
      'hitoCnt',
    ])
      expect(next[key]).toEqual(rebuilt[key])
    expect(next.w1Score).toBe(scoreWithLabel('ぼびー', 'ボビー').score)
    // 画像は枠の位置に付いているので触らない
    expect(next.w1Img).toBe('https://img/1.webp')
    // 入力は書き換えない
    expect(entry.w1).toBe('ボブ')
  })

  it('人の一覧の 4 番目以降は文書の一覧から残す', () => {
    const entry = deliveredOf(row)
    const doc = docOf(row)
    doc.slots.wh1 = { ...doc.slots.wh1, word: 'ボビー', kana: 'ぼびー' }
    const next = entryWithDoc(entry, doc)
    expect(next.hito).toBe('ボビー,チャーリー,デイブ,イブ')
  })

  it('語を消した枠は空になり、スコアも消える', () => {
    const entry = deliveredOf(row)
    const doc = docOf(row)
    doc.slots.wm1 = { ...doc.slots.wm1, word: '', kana: '' }
    const next = entryWithDoc(entry, doc)
    expect(next.w2).toBe('')
    expect(next.w2Score).toBeNull()
    expect(next.mono).toBe('')
  })

  it('読めないかなはエラーの印を付ける (generate-viz と同じ)', () => {
    const entry = deliveredOf(row)
    const doc = docOf(row)
    doc.slots.wh1 = { ...doc.slots.wh1, kana: 'ABC' }
    const next = entryWithDoc(entry, doc)
    expect(next.w1Error).toBe(true)
    expect(next.w1Score).toBeNull()
  })
})

describe('numbersWithDocs', () => {
  it('文書のある番号だけ差し替え、変わった件数を返す', () => {
    const other = deliveredOf({ ...row, num: '002' })
    const entry = deliveredOf(row)
    const doc = docOf({ ...row, wh1: 'ボビー', wh1k: 'ぼびー' })
    const { numbers, changed } = numbersWithDocs([entry, other], {
      '001': doc,
      '002': docOf({ ...row, num: '002' }),
    })
    expect(changed).toBe(1)
    expect(numbers[0].w1).toBe('ボビー')
    expect(numbers[1]).toBe(other)
  })
})

describe('withRep (代表を配信データの 1 件に載せる)', () => {
  it('番号文書の代表と確定を載せ、同じなら元の 1 件のまま', async () => {
    const { withRep } = await import('../firestore/app-entry.js')
    const entry = { num: '531' }
    const doc = {
      rep: { picks: [{ k: 'こみー', w: 'コミー#tri' }], confirmed: true },
    }
    const out = withRep(entry, doc)
    expect(out.rep).toEqual({
      picks: [{ k: 'こみー', w: 'コミー#tri' }],
      confirmed: true,
    })
    expect(withRep(out, doc)).toBe(out)
    expect(withRep(entry, {})).toBe(entry)
  })
})
