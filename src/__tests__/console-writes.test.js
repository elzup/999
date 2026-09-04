import { describe, expect, it } from 'vitest'
import {
  confirmImage,
  nameOf,
  saveRating,
  saveRep,
  saveSlots,
  staleImages,
} from '../firestore/console-writes.js'

const now = '2026-08-20T00:00:00.000Z'

const stored = {
  num: '051',
  hito: '鯉',
  mono: 'コイン',
  gainen: '',
  slots: {
    wh1: { word: '鯉', kana: 'こい', imageUrl: 'https://x.test/a.webp' },
    wm1: { word: 'コイン', kana: 'こいん', imageUrl: '' },
  },
  rep: { picks: [{ k: 'こい', w: '鯉' }], confirmed: true },
  ratings: [{ k: 'こい', w: '鯉', v: 2 }],
  derived: { ptBySlot: {}, rankeyBySlot: {} },
  updatedAt: '2026-01-01T00:00:00.000Z',
  source: 'sheet',
}

function fakeDb(initial = {}) {
  const docs = { ...initial }
  return {
    docs,
    async runTransaction(fn) {
      return fn({
        get: async (num) => docs[num],
        set: async (num, doc) => {
          docs[num] = doc
        },
      })
    },
  }
}

describe('console partial writes', () => {
  it('REQ-CON-001: saving rep leaves ratings untouched', async () => {
    const db = fakeDb({ '051': stored })
    const result = await saveRep(db, {
      num: '051',
      picks: [{ k: 'こいん', w: 'コイン' }],
      confirmed: true,
      current: stored,
      now,
    })

    expect(result.ok).toBe(true)
    expect(db.docs['051'].rep.picks).toEqual([{ k: 'こいん', w: 'コイン' }])
    expect(db.docs['051'].ratings).toEqual(stored.ratings)
  })

  it('REQ-CON-002: saving a rating leaves rep and confirmed untouched', async () => {
    const db = fakeDb({ '051': stored })
    const result = await saveRating(db, {
      num: '051',
      k: 'こいん',
      w: 'コイン',
      v: -1,
      current: stored,
      now,
    })

    expect(result.ok).toBe(true)
    expect(db.docs['051'].rep).toEqual(stored.rep)
    expect(db.docs['051'].ratings).toHaveLength(2)
  })

  it('REQ-CON-002: replaces the rating of the same word instead of appending', async () => {
    const db = fakeDb({ '051': stored })
    await saveRating(db, {
      num: '051',
      k: 'こい',
      w: '鯉',
      v: -1,
      current: stored,
      now,
    })

    expect(db.docs['051'].ratings).toEqual([{ k: 'こい', w: '鯉', v: -1 }])
  })

  it('REQ-CON-003: clearing a rating removes the entry rather than storing 0', async () => {
    const db = fakeDb({ '051': stored })
    await saveRating(db, {
      num: '051',
      k: 'こい',
      w: '鯉',
      v: null,
      current: stored,
      now,
    })

    expect(db.docs['051'].ratings).toEqual([])
  })

  it('REQ-CON-003: 0 is stored explicitly, not treated as cleared', async () => {
    const db = fakeDb({ '051': stored })
    await saveRating(db, {
      num: '051',
      k: 'こいん',
      w: 'コイン',
      v: 0,
      current: stored,
      now,
    })

    expect(db.docs['051'].ratings).toContainEqual({
      k: 'こいん',
      w: 'コイン',
      v: 0,
    })
  })

  it('rejects a rating outside the allowed values', async () => {
    const db = fakeDb({ '051': stored })

    expect(
      await saveRating(db, {
        num: '051',
        k: 'a',
        w: 'b',
        v: 5,
        current: stored,
        now,
      })
    ).toMatchObject({ error: 'invalid rating' })
  })

  it('REQ-CON-004: recording an image keeps the word it was confirmed for', async () => {
    const db = fakeDb({ '051': stored })
    await confirmImage(db, {
      num: '051',
      slot: 'wm1',
      imageUrl: 'https://x.test/b.webp',
      current: stored,
      now,
    })

    expect(db.docs['051'].slots.wm1).toMatchObject({
      imageUrl: 'https://x.test/b.webp',
      confirmedFor: 'コイン',
    })
    expect(db.docs['051'].slots.wh1).toEqual(stored.slots.wh1)
  })

  it('REQ-CON-005: reports an image whose word body changed', () => {
    const doc = {
      slots: {
        wh1: {
          word: '振る#g',
          imageUrl: 'https://x.test/a.webp',
          confirmedFor: '鶴',
        },
        wm1: {
          word: '嫌#g',
          imageUrl: 'https://x.test/b.webp',
          confirmedFor: '嫌',
        },
      },
    }

    // 鶴 -> 振る は別語。嫌 -> 嫌#g はタグが付いただけなので無視する
    expect(staleImages(doc)).toEqual([
      { slot: 'wh1', confirmedFor: '鶴', now: '振る#g' },
    ])
  })

  it('REQ-CON-005: says nothing about slots that were never confirmed', () => {
    expect(
      staleImages({ slots: { wh1: { word: 'X', imageUrl: 'u' } } })
    ).toEqual([])
  })

  it('nameOf strips tags, labels, aliases and parentheses', () => {
    expect(nameOf('嫌#g')).toBe(nameOf('嫌'))
    expect(nameOf('レナコ-p')).toBe(nameOf('レナコ -p'))
    expect(nameOf('甘雨(かんう)#gen')).toBe('甘雨')
    expect(nameOf('鶴')).not.toBe(nameOf('振る#g'))
  })

  it('refuses to write against a document that does not exist', async () => {
    const db = fakeDb()

    expect(
      await saveRep(db, {
        num: '051',
        picks: [],
        confirmed: false,
        current: undefined,
        now,
      })
    ).toMatchObject({ error: 'unknown num' })
  })
})

describe('saveSlots — 語の編集・並べ替え・追加・削除', () => {
  const save = (slots, db) =>
    saveSlots(db, { num: '051', slots, current: stored, now, source: 'app' })

  it('語とかなを直しても rep / ratings に触れない', async () => {
    const db = fakeDb({ '051': stored })
    await save(
      {
        wh1: { word: '鯉のぼり', kana: 'こいのぼり', imageUrl: '' },
        wm1: stored.slots.wm1,
      },
      db
    )

    expect(db.docs['051'].slots.wh1.word).toBe('鯉のぼり')
    expect(db.docs['051'].rep).toEqual(stored.rep)
    expect(db.docs['051'].ratings).toEqual(stored.ratings)
  })

  it('並べ替えは語ごと別のキーへ移すこと。画像も一緒に移る', async () => {
    const db = fakeDb({ '051': stored })
    // wh1 にあった鯉を wh2 へ、コインを wh1 へ
    await save(
      {
        wh1: { ...stored.slots.wm1 },
        wh2: { ...stored.slots.wh1 },
      },
      db
    )

    const slots = db.docs['051'].slots
    expect(slots.wh1.word).toBe('コイン')
    expect(slots.wh2.word).toBe('鯉')
    expect(slots.wh2.imageUrl).toBe('https://x.test/a.webp')
    expect(slots.wm1).toBeUndefined()
  })

  it('送らなかった枠は消える (削除)。評価は値で残る', async () => {
    const db = fakeDb({ '051': stored })
    await save({ wh1: stored.slots.wh1 }, db)

    expect(Object.keys(db.docs['051'].slots)).toEqual(['wh1'])
    // 語を消しても «この語呂はアリか» の判断は生きている
    expect(db.docs['051'].ratings).toEqual(stored.ratings)
  })

  it('語もかなも空の枠は保存しない (空欄で消せる)', async () => {
    const db = fakeDb({ '051': stored })
    await save(
      {
        wh1: stored.slots.wh1,
        wh2: { word: '  ', kana: '', imageUrl: '' },
      },
      db
    )

    expect(Object.keys(db.docs['051'].slots)).toEqual(['wh1'])
  })

  it('新しい枠を足せる。imageUrl 未指定でも検証を通る', async () => {
    const db = fakeDb({ '051': stored })
    const result = await save(
      { ...stored.slots, wh2: { word: '恋', kana: 'こい' } },
      db
    )

    expect(result).toMatchObject({ ok: true })
    expect(db.docs['051'].slots.wh2).toMatchObject({ word: '恋', imageUrl: '' })
  })

  it('確定時点の語 (confirmedFor) は送られた分だけ保つ', async () => {
    const db = fakeDb({ '051': stored })
    await save(
      {
        wh1: { ...stored.slots.wh1, confirmedFor: '鯉' },
        wm1: stored.slots.wm1,
      },
      db
    )

    expect(db.docs['051'].slots.wh1.confirmedFor).toBe('鯉')
  })

  it('知らないスロット名は書き込みごと拒否される', async () => {
    const db = fakeDb({ '051': stored })
    const result = await save({ wx9: { word: 'x', kana: 'えっくす' } }, db)

    expect(result).toMatchObject({ error: 'unknown slot: wx9' })
    expect(db.docs['051']).toBe(stored)
  })

  it('slots がオブジェクトでなければ何も書かない', async () => {
    const db = fakeDb({ '051': stored })

    expect(await save([], db)).toMatchObject({
      error: 'slots must be an object',
    })
    expect(db.docs['051']).toBe(stored)
  })
})
