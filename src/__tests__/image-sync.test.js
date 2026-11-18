// image-sync.js: 手元の cache (4 ファイル) と正本 (Firestore imageSlots) の同期。
// Firestore は最小のモックで置き換え、データの置き場は一時ディレクトリにする。

import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

const dir = mkdtempSync(join(tmpdir(), 'image-sync-'))
process.env.IMAGE_DATA_DIR = dir

let sync
beforeAll(async () => {
  sync = await import('../images/image-sync.js')
})

const img = (hash) => ({
  url: `https://example.test/${hash}.webp`,
  hash,
  sourcePage: '',
  sourceImageUrl: `https://src.test/${hash}.jpg`,
  uploadedAt: '2026-11-18T00:00:00.000Z',
})

const doc = (key, over = {}) => {
  const [id, slot] = key.split(':')
  return {
    id,
    slot,
    image: null,
    keep: false,
    redo: null,
    candidate: null,
    history: [],
    ...over,
  }
}

/** imageSlots だけを持つ Firestore のモック */
function fakeStore(initial) {
  const docs = { ...initial }
  const snapOf = (id) => ({
    id,
    exists: docs[id] !== undefined,
    data: () => docs[id],
  })
  const all = () => Object.keys(docs).map(snapOf)
  const col = {
    doc: (id) => ({ id }),
    get: async () => ({ docs: all() }),
    where: (field, op, value) => ({
      get: async () => ({
        docs: all().filter((s) => (s.data()[field] ?? '') > value),
      }),
    }),
  }
  return {
    docs,
    collection: () => col,
    runTransaction: async (fn) =>
      fn({
        getAll: async (...refs) => refs.map((r) => snapOf(r.id)),
        set: (ref, value) => {
          docs[ref.id] = value
        },
      }),
  }
}

const readFile = (name) => JSON.parse(readFileSync(join(dir, name), 'utf8'))
const writeFile = (name, data) =>
  writeFileSync(join(dir, name), JSON.stringify(data))

const T0 = '2026-11-18T00:00:00.000Z'
const T1 = '2026-11-18T01:00:00.000Z'
const T2 = '2026-11-18T02:00:00.000Z'

describe('diffSlots', () => {
  const files = (over = {}) => ({
    manifest: { version: 1, images: { '001': { w1: img('a') } } },
    keep: { version: 1, keep: {} },
    redo: { version: 1, redo: {} },
    candidates: { version: 1, items: {} },
    ...over,
  })

  it('変わっていなければ何も書かない', () => {
    const base = { '001:w1': doc('001:w1', { image: img('a'), updatedAt: T0 }) }
    expect(sync.diffSlots(base, files())).toEqual([])
  })

  it('画像を差し替えた枠は前の画像を history に残す', () => {
    const base = { '001:w1': doc('001:w1', { image: img('a'), updatedAt: T0 }) }
    const [change] = sync.diffSlots(
      base,
      files({ manifest: { version: 1, images: { '001': { w1: img('b') } } } })
    )
    expect(change.key).toBe('001:w1')
    expect(change.expectedUpdatedAt).toBe(T0)
    expect(change.next.image.hash).toBe('b')
    expect(change.next.history.map((h) => h.hash)).toEqual(['a'])
  })

  it('手元から消えた枠は中身を空にして history を残す (文書は消さない)', () => {
    const base = { '001:w1': doc('001:w1', { image: img('a'), keep: true }) }
    const [change] = sync.diffSlots(
      base,
      files({ manifest: { version: 1, images: {} } })
    )
    expect(change.next).toMatchObject({ image: null, keep: false })
    expect(change.next.history.map((h) => h.hash)).toEqual(['a'])
  })

  it('新しい枠は expectedUpdatedAt が null', () => {
    const [change] = sync.diffSlots({}, files())
    expect(change).toMatchObject({ key: '001:w1', expectedUpdatedAt: null })
  })
})

describe('syncImages', () => {
  beforeEach(() => {
    for (const name of [
      'word-images.json',
      'word-images-keep.json',
      'word-images-redo.json',
      'word-images.candidates.json',
      'image-sync-base.json',
    ])
      writeFile(name, null)
  })

  it('base が無いときは送らずに全件を取り込む', async () => {
    writeFile('word-images.json', { version: 1, images: {} })
    const store = fakeStore({
      '001:w1': doc('001:w1', { image: img('a'), keep: true }),
    })
    const r = await sync.syncImages({ store, now: T1 })
    expect(r).toMatchObject({ pushed: 0, pulled: 1, conflicts: [] })
    expect(store.docs['001:w1'].image.hash).toBe('a')
    expect(readFile('word-images.json').images['001'].w1.hash).toBe('a')
    expect(readFile('word-images-keep.json').keep).toEqual({ '001:w1': true })
  })

  it('手元で変えた枠を送り、正本で変わった枠を取り込む', async () => {
    const store = fakeStore({
      '001:w1': doc('001:w1', { image: img('a') }),
      '002:w1': doc('002:w1', { image: img('x') }),
    })
    await sync.syncImages({ store, now: T1 })
    // 手元: 001 をロック / 正本: 002 を web が差し替え
    writeFile('word-images-keep.json', { version: 1, keep: { '001:w1': true } })
    store.docs['002:w1'] = doc('002:w1', { image: img('y'), updatedAt: T2 })

    const r = await sync.syncImages({ store, now: T2 })
    expect(r.pushed).toBe(1)
    expect(store.docs['001:w1']).toMatchObject({ keep: true, updatedAt: T2 })
    expect(readFile('word-images.json').images['002'].w1.hash).toBe('y')
    expect(readFile('word-images-keep.json').keep).toEqual({ '001:w1': true })
  })

  it('同じ枠を別の面が先に書いていたら上書きせず、正本を取り込む', async () => {
    const store = fakeStore({ '001:w1': doc('001:w1', { image: img('a') }) })
    await sync.syncImages({ store, now: T1 })
    writeFile('word-images.json', {
      version: 1,
      images: { '001': { w1: img('local') } },
    })
    store.docs['001:w1'] = doc('001:w1', { image: img('web'), updatedAt: T2 })

    const r = await sync.syncImages({ store, now: T2 })
    expect(r.conflicts).toEqual(['001:w1'])
    expect(store.docs['001:w1'].image.hash).toBe('web')
    expect(readFile('word-images.json').images['001'].w1.hash).toBe('web')
  })

  it('続けて同期しても何も送らない', async () => {
    const store = fakeStore({ '001:w1': doc('001:w1', { image: img('a') }) })
    await sync.syncImages({ store, now: T1 })
    const r = await sync.syncImages({ store, now: T2 })
    expect(r.pushed).toBe(0)
  })
})
