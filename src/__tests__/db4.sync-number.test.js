// 番号 1 件の保存で新しい形をどう書き換えるか (語の ID の引き継ぎ: 計画 P2-3)
import fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { checkIntegrity } from '../db4/integrity.js'
import { syncNumber } from '../db4/sync-number.js'
import { toNumberDoc } from '../db4/to-legacy.js'
import { canonicalJson } from '../firestore/number-doc.js'
import { sheetFormOfDoc } from '../firestore/sheet-bisync.js'

const slot = (word, kana = '') => ({ word, kana, imageUrl: '' })
const doc = (slots, extra = {}) => ({
  num: '106',
  hito: '',
  mono: '',
  slots,
  updatedAt: 't0',
  ...extra,
})
const counter = () => {
  let n = 0
  return () => `w_test${String(++n).padStart(6, '2')}`
}

/** 1 回目 (前が無い) → 2 回目 と続けて保存する */
function saveTwice(first, second, { sharedIds = new Set() } = {}) {
  const issue = counter()
  const a = syncNumber({ nextDoc: first, issue })
  const b = syncNumber({
    prevSymbol: a.symbol,
    prevWords: a.upsertWords,
    sharedIds,
    nextDoc: second,
    issue,
  })
  const idOf = (result, words, text) =>
    result.symbol.links.find(
      (l) => words.find((w) => w.id === l.wordId)?.text === text
    )?.wordId
  return { a, b, idOf }
}

describe('syncNumber: 語の ID の引き継ぎ', () => {
  it('前が無ければ全部新しい ID', () => {
    const { symbol, upsertWords, deleteWordIds } = syncNumber({
      nextDoc: doc({ wh1: slot('トロ', 'とろ'), wm1: slot('火', 'ひ') }),
      issue: counter(),
    })
    expect(upsertWords.map((w) => w.text)).toEqual(['トロ', '火'])
    expect(symbol.wordIds).toEqual(upsertWords.map((w) => w.id))
    expect(deleteWordIds).toEqual([])
  })

  it('変えずに保存すると ID も語の文書も変わらない', () => {
    const d = doc({ wh1: slot('トロ', 'とろ') })
    const { a, b } = saveTwice(d, d)
    expect(b.symbol.wordIds).toEqual(a.symbol.wordIds)
    expect(b.upsertWords).toEqual([])
    expect(b.deleteWordIds).toEqual([])
  })

  it('並べ替え・人と物の移動では ID が語に付いていく', () => {
    const { a, b, idOf } = saveTwice(
      doc({ wh1: slot('トロ'), wh2: slot('マイ'), wm1: slot('火') }),
      doc({ wh1: slot('火'), wm1: slot('マイ'), wm2: slot('トロ') })
    )
    const words = a.upsertWords
    for (const text of ['トロ', 'マイ', '火']) {
      expect(idOf(b, words, text)).toBe(idOf(a, words, text))
    }
    expect(b.upsertWords).toEqual([])
  })

  it('表記の修正 (同じ位置) は ID を引き継いで綴りを書き換える', () => {
    const { a, b } = saveTwice(
      doc({ wh1: slot('とろ') }),
      doc({ wh1: slot('トロ') })
    )
    expect(b.symbol.wordIds).toEqual(a.symbol.wordIds)
    expect(b.upsertWords).toEqual([
      expect.objectContaining({ id: a.symbol.wordIds[0], text: 'トロ' }),
    ])
  })

  it('他の記号も指す語の表記を直すと、この記号だけ新しい語に分ける (旧 DB とずれないため)', () => {
    const first = doc({ wh1: slot('とろ') })
    const issue = counter()
    const a = syncNumber({ nextDoc: first, issue })
    const shared = new Set(a.symbol.wordIds)
    const b = syncNumber({
      prevSymbol: a.symbol,
      prevWords: a.upsertWords,
      sharedIds: shared,
      nextDoc: doc({ wh1: slot('トロ') }),
      issue,
    })
    expect(b.symbol.wordIds[0]).not.toBe(a.symbol.wordIds[0])
    expect(b.deleteWordIds).toEqual([])
  })

  it('消した語はどこからも指されなければ消す、他の記号が指していれば残す', () => {
    const first = doc({ wh1: slot('トロ'), wh2: slot('マイ') })
    const second = doc({ wh1: slot('トロ') })
    const { a, b, idOf } = saveTwice(first, second)
    const mai = idOf(a, a.upsertWords, 'マイ')
    expect(b.deleteWordIds).toEqual([mai])
    const kept = saveTwice(first, second, { sharedIds: new Set([mai]) })
    expect(kept.b.deleteWordIds).toEqual([])
  })

  it('同じ記号の人のトロと物のトロは、それぞれの family の ID を引き継ぐ', () => {
    const { a, b } = saveTwice(
      doc({ wh1: slot('トロ'), wm1: slot('トロ') }),
      doc({ wh1: slot('トロ'), wm1: slot('トロ'), wm2: slot('火') })
    )
    const byRole = (r, role) =>
      r.symbol.links.find((l) => l.role === role && l.order === 0).wordId
    expect(byRole(b, 'hito')).toBe(byRole(a, 'hito'))
    expect(byRole(b, 'mono')).toBe(byRole(a, 'mono'))
  })

  it('代表は引き継いだ ID を指す', () => {
    const { a, b } = saveTwice(
      doc(
        { wh1: slot('トロ', 'とろ') },
        {
          rep: { picks: [{ k: 'とろ', w: 'トロ' }], confirmed: true },
        }
      ),
      doc(
        { wm1: slot('トロ', 'とろ') },
        {
          rep: { picks: [{ k: 'とろ', w: 'トロ' }], confirmed: true },
        }
      )
    )
    expect(b.symbol.rep.picks).toEqual([{ wordId: a.symbol.wordIds[0] }])
  })
})

// 性質: 何を何回保存しても、新しい形は整合し、旧の形に戻すと保存したものと同じ (C7)
const textArb = fc.constantFrom('火', 'まい', '南', 'トロ', 'ミタ#a', 'ミタ#b')
const slotsArb = fc
  .record({
    wh: fc.array(textArb, { maxLength: 3 }),
    wm: fc.array(textArb, { maxLength: 3 }),
  })
  .map(({ wh, wm }) =>
    Object.fromEntries([
      ...wh.map((w, i) => [`wh${i + 1}`, slot(w)]),
      ...wm.map((w, i) => [`wm${i + 1}`, slot(w)]),
    ])
  )

describe('syncNumber の性質', () => {
  it('続けて保存しても違反 0・旧の形に戻すと同じ・消した語は残らない', () => {
    fc.assert(
      fc.property(fc.array(slotsArb, { minLength: 1, maxLength: 5 }), (seq) => {
        const issue = counter()
        const final = seq.reduce(
          (state, slots) => {
            const nextDoc = doc(slots)
            const r = syncNumber({
              prevSymbol: state.symbol,
              prevWords: state.words,
              nextDoc,
              issue,
            })
            const upserted = new Map(r.upsertWords.map((w) => [w.id, w]))
            const words = [
              ...state.words
                .filter((w) => !r.deleteWordIds.includes(w.id))
                .map((w) => upserted.get(w.id) ?? w),
              ...r.upsertWords.filter(
                (w) => !state.words.some((p) => p.id === w.id)
              ),
            ]
            const wordsById = Object.fromEntries(words.map((w) => [w.id, w]))
            const back = toNumberDoc(r.symbol, wordsById)
            const form = sheetFormOfDoc(nextDoc)
            expect(back.hito).toBe(form.hito)
            expect(back.mono).toBe(form.mono)
            expect(canonicalJson(back.slots)).toBe(canonicalJson(nextDoc.slots))
            return { symbol: r.symbol, words }
          },
          { symbol: null, words: [] }
        )
        const { errors } = checkIntegrity({
          symbols: [final.symbol],
          words: final.words.filter((w) => final.symbol.wordIds.includes(w.id)),
        })
        expect(errors.filter((e) => e.rule !== 'C8')).toEqual([])
        // 指されない語を残していない (C2)
        expect(
          final.words.every((w) => final.symbol.wordIds.includes(w.id))
        ).toBe(true)
      }),
      { numRuns: 500 }
    )
  })
})
