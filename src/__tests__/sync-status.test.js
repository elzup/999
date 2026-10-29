import { describe, expect, it } from 'vitest'
import { normalizeGrid, writeStatusTab } from '../firestore/sheet-io.js'
import {
  STALE_MS,
  stateWithError,
  statusRows,
  syncHealth,
} from '../firestore/sync-status.js'

const NOW = '2026-10-20T00:00:00.000Z'
const nowMs = Date.parse(NOW)
const state = (over = {}) => ({
  lastRunAt: NOW,
  cursor: NOW,
  pending: [],
  conflicts: [],
  ...over,
})

describe('syncHealth', () => {
  it('一度も回っていなければ未実行', () => {
    expect(syncHealth(null, nowMs).level).toBe('never')
  })

  it('何も残っていなければ OK', () => {
    expect(syncHealth(state(), nowMs).level).toBe('ok')
  })

  it('エラーは衝突より重い', () => {
    const s = state({
      conflicts: [{ num: '001' }],
      lastError: { at: NOW, message: 'x' },
    })
    expect(syncHealth(s, nowMs).level).toBe('error')
  })

  it('定期が来ていなければ、即時反映の回があっても止まっている', () => {
    const old = new Date(nowMs - STALE_MS - 1).toISOString()
    expect(syncHealth(state({ cursor: old }), nowMs).level).toBe('stale')
  })

  it('衝突 > 未反映', () => {
    expect(
      syncHealth(state({ conflicts: [{}], pending: ['002'] }), nowMs).level
    ).toBe('conflict')
    expect(syncHealth(state({ pending: ['002'] }), nowMs).level).toBe('pending')
  })
})

describe('stateWithError', () => {
  it('前回の結果を残してエラーだけ重ねる', () => {
    const next = stateWithError(
      state({ pending: ['003'] }),
      new Error('boom'),
      NOW
    )
    expect(next.pending).toEqual(['003'])
    expect(next.lastError).toEqual({ at: NOW, message: 'boom' })
  })
})

describe('statusRows', () => {
  it('衝突は見出しの下に 1 行ずつ並ぶ', () => {
    const rows = statusRows(
      state({
        conflicts: [
          { num: '001', field: 'wm1k', sheet: 'ほ', db: 'び', base: 'ひ' },
        ],
      }),
      nowMs
    )
    expect(rows[0]).toEqual(['状態', '衝突あり'])
    expect(rows).toContainEqual(['001', 'wm1k', 'ほ', 'び', 'ひ'])
  })

  it('回ごとに変わる値を含まない (中身が同じなら書かずに済むように)', () => {
    const a = statusRows(state({ lastRunAt: NOW, lastReport: { read: 3 } }))
    const b = statusRows(
      state({ lastRunAt: '2026-10-20T00:05:00.000Z', lastReport: { read: 9 } })
    )
    expect(normalizeGrid(a)).toBe(normalizeGrid(b))
  })
})

describe('writeStatusTab', () => {
  const recorder = (titles, values = []) => {
    const calls = []
    const sheetsApi = async (path, init = {}) => {
      calls.push({ path, method: init.method ?? 'GET' })
      if (path.includes('fields=sheets')) {
        return { sheets: titles.map((title) => ({ properties: { title } })) }
      }
      if (!init.method) return { values }
      return {}
    }
    return { calls, sheetsApi }
  }

  it('タブが無ければ作ってから消して書く', async () => {
    const r = recorder(['999'])
    await writeStatusTab({
      ...r,
      spreadsheetId: 'S',
      tab: 'sync',
      rows: [['a']],
    })
    expect(r.calls.map((c) => c.method)).toEqual(['GET', 'POST', 'POST', 'PUT'])
    expect(r.calls[1].path).toBe('/S:batchUpdate')
  })

  it('中身が同じなら読むだけで書かない', async () => {
    // values API は数値を文字列で返し、行末と末尾行の空セルを落とす
    const r = recorder(['999', 'sync'], [['衝突', '0'], [], ['x']])
    const result = await writeStatusTab({
      ...r,
      spreadsheetId: 'S',
      tab: 'sync',
      rows: [['衝突', 0, ''], [], ['x'], []],
    })
    expect(result.written).toBe(false)
    expect(r.calls.map((c) => c.method)).toEqual(['GET', 'GET'])
  })

  it('タブがあれば作らない', async () => {
    const r = recorder(['999', 'sync'], [['old']])
    await writeStatusTab({
      ...r,
      spreadsheetId: 'S',
      tab: 'sync',
      rows: [['a']],
    })
    expect(r.calls.map((c) => c.method)).toEqual(['GET', 'GET', 'POST', 'PUT'])
  })
})
