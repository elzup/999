import { describe, expect, it } from 'vitest'
import { connectRest } from '../firestore/rest.js'
import { writeNumber } from '../firestore/write.js'

// beginTransaction / 読み / commit だけを返す偽の fetch。commit の中身を残す
function fakeFetch(current) {
  const commits = []
  const fetchImpl = async (url, init = {}) => {
    const json = (body) => ({ ok: true, status: 200, json: async () => body })
    if (url.endsWith(':beginTransaction')) return json({ transaction: 'tx1' })
    if (url.endsWith(':commit')) {
      commits.push(JSON.parse(init.body))
      return json({})
    }
    if (!current) return { ok: false, status: 404, json: async () => ({}) }
    return json({
      fields: {
        num: { stringValue: current.num },
        updatedAt: { stringValue: current.updatedAt },
      },
    })
  }
  return { fetchImpl, commits }
}

const doc = {
  num: '051',
  hito: 'こい',
  mono: '恋',
  gainen: '',
  slots: {
    wh1: { word: 'こい', kana: 'こい', imageUrl: '' },
    wm1: { word: '恋', kana: 'こい', imageUrl: '' },
  },
  updatedAt: '2026-11-26T07:00:00.000Z',
  source: 'console',
}

// 新しい形 (v4) への書き込みは src/__tests__/db4.rest-io.test.js (DB4_WRITE=on)。
// 11/26 の hash ID の写し (symbols/n:051) は P5 で捨てたので、その試験も消した
describe('rest: 競合', () => {
  it('競合したら何も書かない', async () => {
    const { fetchImpl, commits } = fakeFetch({ num: '051', updatedAt: 'other' })
    const db = connectRest({
      projectId: 'p',
      token: 't',
      fetchImpl,
      source: 'symbols',
    })
    const result = await writeNumber(db, {
      num: '051',
      doc,
      expectedUpdatedAt: 't0',
    })
    expect(result.error).toBe('conflict')
    expect(commits.every((c) => c.writes.length === 0)).toBe(true)
  })
})

describe('rest: numbers 読み (既定) のとき', () => {
  it('numbers だけを書く (symbols / words に書かない)', async () => {
    const { fetchImpl, commits } = fakeFetch({ num: '051', updatedAt: 't0' })
    const db = connectRest({
      projectId: 'p',
      token: 't',
      fetchImpl,
      source: 'numbers',
    })
    const result = await writeNumber(db, {
      num: '051',
      doc,
      expectedUpdatedAt: 't0',
    })
    expect(result.ok).toBe(true)
    const names = commits[0].writes.map(
      (w) => w.update.name.split('/documents/')[1]
    )
    expect(names).toEqual(['numbers/051'])
  })
})
