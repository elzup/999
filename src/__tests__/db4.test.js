import { describe, expect, it } from 'vitest'
import { fromLegacy } from '../db4/from-legacy.js'
import { issueWordId, migrationWordId, WORD_ID_RE } from '../db4/ids.js'
import { checkIntegrity } from '../db4/integrity.js'
import { roleLabel } from '../db4/roles.js'
import { toCard, toNumberDoc } from '../db4/to-legacy.js'

const numberDoc = (num, hito, mono, slots = {}) => ({ num, hito, mono, slots })
const slot = (word, kana = '') => ({ word, kana, imageUrl: '' })

describe('db4 ids', () => {
  it('移行の ID は種が同じなら同じ、形は w_ + 10 字', () => {
    expect(migrationWordId('ムイミ|pr|num:613:hito:0')).toBe(
      migrationWordId('ムイミ|pr|num:613:hito:0')
    )
    expect(migrationWordId('a')).not.toBe(migrationWordId('b'))
    expect(migrationWordId('a')).toMatch(WORD_ID_RE)
    expect(issueWordId()).toMatch(WORD_ID_RE)
  })
  it('区分の表示名は表から引く', () => {
    expect(roleLabel('thing')).toBe('物')
    expect(roleLabel('action')).toBe('行動')
  })
})

describe('db4 語の寄せ方 (D-0163)', () => {
  it('別の記号の同じ綴りは同じ語、同じ記号の人と物の同綴りは別の語', () => {
    const { symbols, words } = fromLegacy({
      numbers: [
        numberDoc('106', 'トロ', 'トロ', {
          wh1: slot('トロ', 'とろ'),
          wm1: slot('トロ', 'とろ'),
        }),
        numberDoc('233', '', 'ニス', { wm1: slot('ニス', 'にす') }),
      ],
      cards: [
        {
          suit: 'S',
          rank: '2',
          person: '',
          actionP: '',
          personScore: null,
          object: 'ニス',
          actionO: '塗る',
          objectScore: 3,
          action: 'ニス塗る',
          actionScore: 1,
        },
      ],
    })
    const idsOf = (id) =>
      symbols.find((s) => s.id === id).links.map((l) => l.wordId)
    const [toroHito, toroMono] = idsOf('num:106')
    expect(toroHito).not.toBe(toroMono)
    expect(idsOf('card:S2')[0]).toBe(idsOf('num:233')[0])
    expect(words.filter((w) => w.text === 'ニス')).toHaveLength(1)
  })

  it('出典 2 つの項目は語 2 つ (同じ role + order)、戻すと元の綴り', () => {
    const doc = numberDoc('500', '黄泉#ｽﾀﾚ#tri -n', '', {
      wh1: slot('黄泉#ｽﾀﾚ#tri -n', 'よみ'),
    })
    const { symbols, words } = fromLegacy({ numbers: [doc] })
    expect(symbols[0].links).toHaveLength(2)
    expect(words.map((w) => w.source).sort()).toEqual(['tri', 'ｽﾀﾚ'])
    const back = toNumberDoc(
      symbols[0],
      Object.fromEntries(words.map((w) => [w.id, w]))
    )
    expect(back.hito).toBe('黄泉#ｽﾀﾚ#tri -n')
  })

  it('カードは往復で元に戻る', () => {
    const card = {
      suit: 'H',
      rank: 'A',
      person: 'エヴァ',
      actionP: '乗る',
      personScore: 2,
      object: 'エヴァ',
      actionO: '',
      objectScore: null,
      action: '',
      actionScore: null,
    }
    const { symbols, words } = fromLegacy({ cards: [card] })
    expect(
      toCard(symbols[0], Object.fromEntries(words.map((w) => [w.id, w])))
    ).toEqual(card)
  })
})

describe('db4 checkIntegrity', () => {
  const base = () =>
    fromLegacy({
      numbers: [
        numberDoc('001', 'まい', '火', {
          wh1: slot('まい', 'まい'),
          wm1: slot('火', 'ひ'),
        }),
      ],
    })
  const rulesOf = (db) => checkIntegrity(db).errors.map((e) => e.rule)

  it('正しいデータは違反 0', () => {
    expect(rulesOf(base())).toEqual([])
  })
  it('C1: 指す語が無い', () => {
    const db = base()
    expect(rulesOf({ ...db, words: db.words.slice(1) })).toEqual(
      expect.arrayContaining(['C1'])
    )
  })
  it('C2: どこからも指されない語', () => {
    const db = base()
    expect(
      rulesOf({
        ...db,
        words: [
          ...db.words,
          { id: issueWordId(), text: '孤児', source: '', labels: [] },
        ],
      })
    ).toEqual(['C2'])
  })
  it('C4: kind に使えない role', () => {
    const db = base()
    const [s] = db.symbols
    expect(
      rulesOf({
        ...db,
        symbols: [
          {
            ...s,
            links: s.links.map((l, i) =>
              i === 0 ? { ...l, role: 'action' } : l
            ),
          },
        ],
      })
    ).toContain('C4')
  })
  it('C5: 同じ枠に同じ語が 2 回', () => {
    const db = base()
    const [s] = db.symbols
    expect(
      rulesOf({ ...db, symbols: [{ ...s, links: [...s.links, s.links[0]] }] })
    ).toContain('C5')
  })
  it('C6: 代表が結び付きに無い語', () => {
    const db = base()
    const [s] = db.symbols
    const stray = { id: issueWordId(), text: 'x', source: '', labels: [] }
    const next = {
      ...s,
      rep: { picks: [{ wordId: stray.id }], confirmed: true },
    }
    expect(
      rulesOf({
        symbols: [
          next,
          {
            id: 'num:002',
            kind: 'num',
            links: [{ wordId: stray.id, role: 'person', order: 0 }],
            wordIds: [stray.id],
            kanaOnly: [],
            extras: {},
          },
        ],
        words: [...db.words, stray],
      })
    ).toContain('C6')
  })
  it('C6: 代表は結び付きの語を全部並べてもよいが、同じ語を 2 回は誤り', () => {
    const db = base()
    const [s] = db.symbols
    const ids = s.links.map((l) => l.wordId)
    const withPicks = (picks) => ({
      ...db,
      symbols: [{ ...s, rep: { picks, confirmed: true } }],
    })
    expect(rulesOf(withPicks(ids.map((wordId) => ({ wordId }))))).toEqual([])
    expect(
      rulesOf(withPicks([{ wordId: ids[0] }, { wordId: ids[0] }]))
    ).toContain('C6')
  })
  it('C8: 語の ID の形', () => {
    const db = base()
    const bad = { ...db.words[0], id: 'w_hash' }
    const symbols = db.symbols.map((s) => ({
      ...s,
      links: s.links.map((l) =>
        l.wordId === db.words[0].id ? { ...l, wordId: 'w_hash' } : l
      ),
      wordIds: s.wordIds.map((id) => (id === db.words[0].id ? 'w_hash' : id)),
    }))
    expect(rulesOf({ symbols, words: [bad, ...db.words.slice(1)] })).toContain(
      'C8'
    )
  })
  it('C3: 同じ綴りの語は notices に出る (違反ではない)', () => {
    const db = fromLegacy({
      numbers: [
        numberDoc('106', 'トロ', 'トロ', {
          wh1: slot('トロ'),
          wm1: slot('トロ'),
        }),
      ],
    })
    const { errors, notices } = checkIntegrity(db)
    expect(errors).toEqual([])
    expect(notices.map((n) => n.rule)).toEqual(['C3'])
  })
  it('C9: 同じ kind の記号 2 つから指される語', () => {
    const db = fromLegacy({
      numbers: [
        numberDoc('143', '', '氷山', { wm1: slot('氷山') }),
        numberDoc('843', '', '氷山', { wm1: slot('氷山') }),
      ],
    })
    expect(rulesOf(db)).toEqual(['C9'])
  })
})
