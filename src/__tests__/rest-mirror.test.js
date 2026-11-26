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

describe('rest: 保存は symbols / words にも同じ commit で書く', () => {
  it('numbers と symbols / words が 1 つの commit に入る', async () => {
    const { fetchImpl, commits } = fakeFetch({ num: '051', updatedAt: 't0' })
    const db = connectRest({ projectId: 'p', token: 't', fetchImpl })
    const result = await writeNumber(db, {
      num: '051',
      doc,
      expectedUpdatedAt: 't0',
    })
    expect(result.ok).toBe(true)
    expect(commits).toHaveLength(1)
    const names = commits[0].writes.map(
      (w) => w.update.name.split('/documents/')[1]
    )
    expect(names).toContain('numbers/051')
    expect(names).toContain('symbols/n:051')
    expect(
      names.filter((n) => n.startsWith('words/w_')).length
    ).toBeGreaterThan(0)
    expect(commits[0].transaction).toBe('tx1')
  })

  it('語は merge (updateMask 付き)、記号は丸ごと置き換え', async () => {
    const { fetchImpl, commits } = fakeFetch({ num: '051', updatedAt: 't0' })
    const db = connectRest({ projectId: 'p', token: 't', fetchImpl })
    await writeNumber(db, { num: '051', doc, expectedUpdatedAt: 't0' })
    const writes = commits[0].writes
    const word = writes.find((w) => w.update.name.includes('/words/'))
    const symbol = writes.find((w) => w.update.name.includes('/symbols/'))
    expect(word.updateMask.fieldPaths.sort()).toEqual([
      'category',
      'key',
      'source',
      'text',
    ])
    expect(symbol.updateMask).toBeUndefined()
  })

  it('競合したら何も書かない', async () => {
    const { fetchImpl, commits } = fakeFetch({ num: '051', updatedAt: 'other' })
    const db = connectRest({ projectId: 'p', token: 't', fetchImpl })
    const result = await writeNumber(db, {
      num: '051',
      doc,
      expectedUpdatedAt: 't0',
    })
    expect(result.error).toBe('conflict')
    expect(commits.every((c) => c.writes.length === 0)).toBe(true)
  })
})
