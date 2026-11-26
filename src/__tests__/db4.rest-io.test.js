// REST の経路 (端末の CLI) も、番号の保存と同じ commit で新しい形を書くこと。
// emulator は transaction 付きの REST の読みに応えないので、応答を偽の fetch で返して確かめる
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { connectRest, toFields } from '../firestore/rest.js'
import { writeNumber } from '../firestore/write.js'

const ROOT = 'projects/p/databases/(default)/documents'

function fakeFirestore(docs) {
  const calls = []
  const fetchImpl = async (url, init = {}) => {
    const path = decodeURIComponent(url.split('/documents')[1].split('?')[0])
    const body = init.body ? JSON.parse(init.body) : undefined
    calls.push({ path, method: init.method ?? 'GET', body })
    const json = (status, data) => ({
      status,
      ok: status < 400,
      json: async () => data,
    })
    if (path === ':beginTransaction') return json(200, { transaction: 'tx1' })
    if (path === ':commit') return json(200, {})
    if (path === ':runQuery') {
      const values =
        body.structuredQuery.where.fieldFilter.value.arrayValue.values.map(
          (v) => v.stringValue
        )
      const hits = Object.entries(docs)
        .filter(
          ([key, d]) =>
            key.startsWith('/symbols/') &&
            d.wordIds?.some((id) => values.includes(id))
        )
        .map(([key, d]) => ({
          document: { name: `${ROOT}${key}`, fields: toFields(d) },
        }))
      return json(200, hits.length ? hits : [{ readTime: 't' }])
    }
    const doc = docs[path]
    return doc
      ? json(200, { name: `${ROOT}${path}`, fields: toFields(doc) })
      : json(404, {})
  }
  return { calls, fetchImpl }
}

const slot = (word, kana = '') => ({ word, kana, imageUrl: '' })

describe('REST の経路 + 新しい形 (DB4_WRITE=on)', () => {
  beforeEach(() => {
    process.env.DB4_WRITE = 'on'
  })
  afterEach(() => {
    delete process.env.DB4_WRITE
  })

  it('記号・語・他の記号を transaction で読み、numbers と同じ commit で書く。消えた語は delete', async () => {
    const wTro = 'w_aaaaaaaaaa'
    const wMai = 'w_bbbbbbbbbb'
    const docs = {
      '/numbers/106': {
        num: '106',
        hito: '',
        mono: '',
        slots: { wh1: slot('トロ'), wh2: slot('マイ') },
        updatedAt: 't0',
      },
      '/symbols/num:106': {
        kind: 'num',
        links: [
          { wordId: wTro, role: 'person', order: 0, kana: '' },
          { wordId: wMai, role: 'person', order: 1, kana: '' },
        ],
        wordIds: [wTro, wMai],
        kanaOnly: [],
        extras: {},
      },
      [`/words/${wTro}`]: { text: 'トロ', source: '', labels: [] },
      [`/words/${wMai}`]: { text: 'マイ', source: '', labels: [] },
    }
    const { calls, fetchImpl } = fakeFirestore(docs)
    const db = connectRest({ projectId: 'p', token: 't', fetchImpl })
    const r = await writeNumber(db, {
      num: '106',
      doc: {
        num: '106',
        hito: '',
        mono: '',
        slots: { wh1: slot('トロ') },
        updatedAt: 't1',
        source: 'app',
      },
      expectedUpdatedAt: 't0',
      intent: ['slots', 'hito', 'mono'],
    })
    expect(r.ok).toBe(true)
    const reads = calls.filter((c) => c.method === 'GET').map((c) => c.path)
    expect(reads).toEqual(
      expect.arrayContaining([
        '/numbers/106',
        '/symbols/num:106',
        `/words/${wTro}`,
        `/words/${wMai}`,
      ])
    )
    const query = calls.find((c) => c.path === ':runQuery')
    expect(query.body.transaction).toBe('tx1')
    const commit = calls.find((c) => c.path === ':commit')
    const names = commit.body.writes.map(
      (w) => w.update?.name ?? `delete ${w.delete}`
    )
    expect(names).toEqual([
      `${ROOT}/numbers/106`,
      `${ROOT}/symbols/num:106`,
      `delete ${ROOT}/words/${wMai}`,
    ])
  })
})
