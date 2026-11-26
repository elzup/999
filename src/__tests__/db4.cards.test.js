// カードを DB で直す (D-0174)
import { describe, expect, it } from 'vitest'
import { saveCard } from '../db4/cards.js'
import { fromLegacy } from '../db4/from-legacy.js'
import { decodeWords } from '../db4/tag-codec.js'
import { toCard } from '../db4/to-legacy.js'
import { SYMBOLS, WORDS } from '../db4/write-layer.js'

const card = {
  suit: 'S',
  rank: 'A',
  person: 'エース',
  actionP: '走る',
  personScore: 2,
  object: '槍',
  actionO: '',
  objectScore: null,
  action: '投げる',
  actionScore: null,
}

function memory() {
  const built = fromLegacy({ cards: [card] })
  const cols = {
    [SYMBOLS]: new Map(built.symbols.map(({ id, ...s }) => [id, s])),
    [WORDS]: new Map(built.words.map(({ id, ...w }) => [id, w])),
    tags: new Map(),
    snapshots: new Map(),
    meta: new Map(),
  }
  const run = async (fn) => {
    const writes = []
    const io = {
      getDocs: async (col, ids) =>
        ids.map((id) =>
          cols[col].has(id) ? { id, ...cols[col].get(id) } : undefined
        ),
      findSymbolsUsing: async () => [],
      listTags: async () =>
        [...(cols.tags ?? new Map())].map(([id, t]) => ({ id, ...t })),
      set: (col, id, data) => writes.push(() => cols[col].set(id, data)),
      remove: (col, id) => writes.push(() => cols[col].delete(id)),
    }
    const result = await fn(io)
    for (const w of writes) w()
    return result
  }
  const read = () => {
    const tags = [...cols.tags].map(([id, t]) => ({ id, ...t }))
    const words = Object.fromEntries(
      decodeWords(
        [...cols[WORDS]].map(([id, w]) => ({ id, ...w })),
        tags
      ).map((w) => [w.id, w])
    )
    return toCard({ id: 'card:SA', ...cols[SYMBOLS].get('card:SA') }, words)
  }
  return { run, read, cols }
}

describe('saveCard', () => {
  it('直した欄だけ変わり、他の欄は残る。消えた語は消える', async () => {
    const m = memory()
    const r = await saveCard(m.run, 'SA', { object: '盾', objectScore: 3 })
    expect(r.ok).toBe(true)
    expect(m.read()).toEqual({ ...card, object: '盾', objectScore: 3 })
    expect([...m.cols[WORDS].values()].map((w) => w.text).sort()).toEqual(
      ['エース', '投げる', '盾'].sort()
    )
  })

  it('知らない欄・形の違う値・知らないカードは書かない', async () => {
    const m = memory()
    expect(await saveCard(m.run, 'SA', { foo: 'x' })).toEqual({
      error: 'invalid_patch',
    })
    expect(await saveCard(m.run, 'SA', { personScore: 9 })).toEqual({
      error: 'invalid_patch',
    })
    expect(await saveCard(m.run, 'X1', { person: 'a' })).toEqual({
      error: 'invalid_card',
    })
    expect(m.read()).toEqual(card)
  })
})
