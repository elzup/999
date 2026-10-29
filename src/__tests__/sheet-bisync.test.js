import { describe, expect, it } from 'vitest'
import {
  docFromSheetForm,
  planNumber,
  sheetFormOfDoc,
  sheetFormOfRow,
} from '../firestore/sheet-bisync.js'
import { runBisync } from '../firestore/sheet-bisync-run.js'
import { rowsOf } from '../firestore/sheet-io.js'

const NOW = '2026-10-20T00:00:00.000Z'
const LATER = '2026-10-20T00:10:00.000Z'

const cells = (over = {}) => ({
  hito: '麻衣(先輩),まい#日常,レイ#pr',
  mono: '火,帯',
  wh1k: 'まい',
  wh2k: 'まい',
  wh3k: 'れい',
  wm1k: 'ひ',
  wm2k: 'おび',
  wm3k: '',
  ...over,
})

const doc = (over = {}) => ({
  num: '001',
  hito: '麻衣(先輩),まい#日常,レイ#pr',
  mono: '火,帯',
  gainen: '',
  slots: {
    wh1: { word: '麻衣(先輩)', kana: 'まい', imageUrl: 'img-mai' },
    wh2: { word: 'まい#日常', kana: 'まい', imageUrl: '' },
    wh3: { word: 'レイ#pr', kana: 'れい', imageUrl: 'img-rei' },
    wm1: { word: '火', kana: 'ひ', imageUrl: '' },
    wm2: { word: '帯', kana: 'おび', imageUrl: '' },
  },
  rep: { picks: [{ k: 'まい', w: '麻衣(先輩)' }], confirmed: true },
  ratings: [{ k: 'ひ', w: '火', v: 2 }],
  updatedAt: NOW,
  source: 'sheet',
  ...over,
})

describe('sheet form', () => {
  it('同期済みの文書とシート行は同じ形になる', () => {
    expect(sheetFormOfDoc(doc())).toEqual(sheetFormOfRow(cells()))
  })

  it('4 番目以降の項目は hito から引き継ぐ', () => {
    const d = doc({ hito: '麻衣(先輩),まい#日常,レイ#pr,舞' })
    expect(sheetFormOfDoc(d).hito).toBe('麻衣(先輩),まい#日常,レイ#pr,舞')
  })

  it('アプリで消した中抜けの枠は詰め、かなも一緒に詰める', () => {
    const { wh2: _drop, ...slots } = doc().slots
    const form = sheetFormOfDoc(doc({ slots }))
    expect(form.hito).toBe('麻衣(先輩),レイ#pr')
    expect([form.wh1k, form.wh2k, form.wh3k]).toEqual(['まい', 'れい', ''])
  })

  it('語が別の位置へ動いても画像は語に付いて回る (REQ-BI-006)', () => {
    const form = sheetFormOfRow(
      cells({
        hito: 'レイ#pr,麻衣(先輩)',
        wh1k: 'れい',
        wh2k: 'まい',
        wh3k: '',
      })
    )
    const next = docFromSheetForm(doc(), form, { now: LATER })
    expect(next.slots.wh1).toMatchObject({
      word: 'レイ#pr',
      imageUrl: 'img-rei',
    })
    expect(next.slots.wh2).toMatchObject({
      word: '麻衣(先輩)',
      imageUrl: 'img-mai',
    })
    expect(next.slots.wh3).toBeUndefined()
    expect(next.rep).toEqual(doc().rep)
    expect(next.ratings).toEqual(doc().ratings)
  })
})

describe('planNumber (3-way)', () => {
  const base = sheetFormOfRow(cells())

  it('シートだけ変わったら DB へ書く (REQ-BI-001)', () => {
    const plan = planNumber({
      sheetForm: sheetFormOfRow(cells({ wm1k: 'ほ' })),
      doc: doc(),
      base,
      now: LATER,
    })
    expect(plan.sheetCells).toEqual({})
    expect(plan.dbDoc.slots.wm1.kana).toBe('ほ')
    expect(plan.dbDoc.source).toBe('sheet')
    expect(plan.conflicts).toEqual([])
  })

  it('DB だけ変わったらシートへ書く (REQ-BI-002)', () => {
    const d = doc({ source: 'app' })
    const slots = { ...d.slots, wh1: { ...d.slots.wh1, word: '舞衣' } }
    const plan = planNumber({
      sheetForm: base,
      doc: { ...d, slots },
      base,
      now: LATER,
    })
    expect(plan.sheetCells).toEqual({ hito: '舞衣,まい#日常,レイ#pr' })
    // DB の hito が古いままなので、揃えるために DB も書き直す
    expect(plan.dbDoc.hito).toBe('舞衣,まい#日常,レイ#pr')
  })

  it('両側で別の値になったら書かずに衝突を返す (REQ-BI-003)', () => {
    const d = doc()
    const slots = { ...d.slots, wm1: { ...d.slots.wm1, kana: 'び' } }
    const plan = planNumber({
      sheetForm: sheetFormOfRow(cells({ wm1k: 'ほ' })),
      doc: { ...d, slots },
      base,
      now: LATER,
    })
    expect(plan.conflicts).toEqual([
      { field: 'wm1k', sheet: 'ほ', db: 'び', base: 'ひ' },
    ])
    expect(plan.sheetCells).toEqual({})
    expect(plan.dbDoc).toBeNull()
    expect(plan.nextBase.wm1k).toBe('ひ')
  })

  it('両側で同じ値になったら書かず base だけ進める', () => {
    const d = doc()
    const slots = { ...d.slots, wm1: { ...d.slots.wm1, kana: 'ほ' } }
    const plan = planNumber({
      sheetForm: sheetFormOfRow(cells({ wm1k: 'ほ' })),
      doc: { ...d, slots },
      base,
      now: LATER,
    })
    expect(plan.sheetCells).toEqual({})
    expect(plan.dbDoc).toBeNull()
    expect(plan.nextBase.wm1k).toBe('ほ')
  })

  it('base が無ければ source=app の文書は DB を採る (REQ-BI-009)', () => {
    const d = doc({ source: 'app' })
    const slots = { ...d.slots, wm1: { ...d.slots.wm1, kana: 'び' } }
    const plan = planNumber({
      sheetForm: base,
      doc: { ...d, slots },
      base: undefined,
      now: LATER,
    })
    expect(plan.sheetCells).toEqual({ wm1k: 'び' })
    expect(plan.bootstrapped).toHaveLength(1)
  })

  it('base が無ければ source=sheet の文書はシートを採る', () => {
    const plan = planNumber({
      sheetForm: sheetFormOfRow(cells({ wm1k: 'ほ' })),
      doc: doc(),
      base: undefined,
      now: LATER,
    })
    expect(plan.dbDoc.slots.wm1.kana).toBe('ほ')
  })
})

describe('rowsOf', () => {
  it('見出しから列を引き、3 桁の行だけ返す', () => {
    const header = [
      'num',
      '人',
      '物',
      'ng',
      '_',
      'wh1',
      'check',
      'wh1k',
      'rankey',
      'wm1',
      'check',
      'wm1k',
      'rankey',
      'wh2',
      'check',
      'wh2k',
      'rankey',
      'wm2',
      'check',
      'wm2k',
      'rankey',
      'wh3',
      'check',
      'wh3k',
      'rankey',
      'wm3',
      'check',
      'wm3k',
      'rankey',
    ]
    const row = ['002', '鬼', '松,荷', 'FALSE', '', '鬼', '', 'おに']
    const { rows, columns } = rowsOf([header, row, ['1001', 'x']])
    expect(columns.wm1k).toBe(11)
    expect(rows).toEqual([
      {
        num: '002',
        rowNumber: 2,
        cells: {
          hito: '鬼',
          mono: '松,荷',
          wh1k: 'おに',
          wh2k: '',
          wh3k: '',
          wm1k: '',
          wm2k: '',
          wm3k: '',
        },
      },
    ])
  })
})

/** シートとストアの偽物。書き込みを記録し、割り込み編集を差し込める */
function fakeWorld({ sheetCells, docs, base = null, state = null }) {
  const sheet = { cells: { ...sheetCells }, writes: [], interfere: null }
  const world = { docs: { ...docs }, base, state, dbWrites: [] }
  const sheetIo = {
    async readRows() {
      return {
        rows: Object.entries(sheet.cells).map(([num, c], i) => ({
          num,
          rowNumber: i + 2,
          cells: c,
        })),
      }
    },
    async writeCells(updates) {
      sheet.interfere?.()
      const written = []
      const skipped = []
      for (const u of updates) {
        const actual = sheet.cells[u.num][u.field]
        if (actual !== u.expected) {
          skipped.push({ ...u, reason: 'changed' })
          continue
        }
        sheet.cells[u.num] = { ...sheet.cells[u.num], [u.field]: u.value }
        written.push(u)
      }
      sheet.writes.push(...written)
      return { written, skipped }
    },
  }
  const store = {
    readBase: async () => world.base,
    writeBase: async (entries) => {
      world.base = { nums: { ...(world.base?.nums ?? {}), ...entries } }
    },
    readState: async () => world.state,
    writeState: async (s) => {
      world.state = s
    },
    readChangedSince: async (iso) =>
      Object.fromEntries(
        Object.entries(world.docs).filter(([, d]) => !iso || d.updatedAt > iso)
      ),
    readNumbers: async (nums) =>
      Object.fromEntries(
        nums.filter((n) => world.docs[n]).map((n) => [n, world.docs[n]])
      ),
    writeNumber: async ({ num, doc: next, expectedUpdatedAt }) => {
      if ((world.docs[num]?.updatedAt ?? null) !== expectedUpdatedAt) {
        return { error: 'conflict' }
      }
      world.docs[num] = next
      world.dbWrites.push(num)
      return { ok: true }
    },
  }
  return { sheet, world, sheetIo, store }
}

describe('runBisync', () => {
  it('初回で base を作り、2 回目は書き込み 0 件 (REQ-BI-008)', async () => {
    const w = fakeWorld({
      sheetCells: { '001': cells() },
      // cursor の手前の余白に入らない古い文書にして、差分読みが 0 件になるのを見る
      docs: { '001': doc({ updatedAt: '2026-10-19T00:00:00.000Z' }) },
    })
    const first = await runBisync({
      sheet: w.sheetIo,
      store: w.store,
      now: NOW,
    })
    expect(first.dbWritten + first.sheetWritten).toBe(0)
    expect(w.world.base.nums['001']).toEqual(sheetFormOfRow(cells()))

    const second = await runBisync({
      sheet: w.sheetIo,
      store: w.store,
      now: LATER,
    })
    expect(second.counts.read).toBe(0)
    expect(second.dbWritten + second.sheetWritten).toBe(0)
  })

  it('アプリの編集をシートへ、シートの編集を DB へ流す', async () => {
    const w = fakeWorld({
      sheetCells: { '001': cells(), '002': cells({ hito: '鬼', mono: '' }) },
      docs: {
        '001': doc(),
        '002': doc({
          num: '002',
          hito: '鬼',
          mono: '',
          slots: {
            wh1: { word: '鬼', kana: 'まい', imageUrl: '' },
            wh2: { word: '', kana: 'まい', imageUrl: '' },
            wh3: { word: '', kana: 'れい', imageUrl: '' },
            wm1: { word: '', kana: 'ひ', imageUrl: '' },
            wm2: { word: '', kana: 'おび', imageUrl: '' },
          },
        }),
      },
    })
    await runBisync({ sheet: w.sheetIo, store: w.store, now: NOW })

    // アプリが 001 の語を直し、シートで 002 のかなを直す
    const d = w.world.docs['001']
    w.world.docs['001'] = {
      ...d,
      slots: { ...d.slots, wm2: { ...d.slots.wm2, word: '帯#g' } },
      updatedAt: LATER,
      source: 'app',
    }
    w.sheet.cells['002'] = { ...w.sheet.cells['002'], wh1k: 'おに' }

    const run = await runBisync({
      sheet: w.sheetIo,
      store: w.store,
      now: LATER,
    })
    expect(run.conflicts).toEqual([])
    expect(w.sheet.cells['001'].mono).toBe('火,帯#g')
    expect(w.world.docs['002'].slots.wh1.kana).toBe('おに')
    expect(w.world.docs['001'].rep).toEqual(doc().rep)
  })

  it('書く直前にシートが触られていたら書かず、次の回で拾う (REQ-BI-005, 007)', async () => {
    const w = fakeWorld({
      sheetCells: { '001': cells() },
      docs: { '001': doc() },
    })
    await runBisync({ sheet: w.sheetIo, store: w.store, now: NOW })

    const d = w.world.docs['001']
    w.world.docs['001'] = {
      ...d,
      slots: { ...d.slots, wm1: { ...d.slots.wm1, kana: 'び' } },
      updatedAt: LATER,
      source: 'app',
    }
    w.sheet.interfere = () => {
      w.sheet.cells['001'] = { ...w.sheet.cells['001'], wm1k: 'ほ' }
      w.sheet.interfere = null
    }
    const run = await runBisync({
      sheet: w.sheetIo,
      store: w.store,
      now: LATER,
    })
    expect(run.failed).toEqual(['001'])
    expect(w.sheet.cells['001'].wm1k).toBe('ほ')
    expect(w.world.base.nums['001'].wm1k).toBe('ひ')
    expect(w.world.state.pending).toEqual(['001'])

    // 次の回は両側が別の値なので衝突として残る
    const next = await runBisync({
      sheet: w.sheetIo,
      store: w.store,
      now: '2026-10-20T00:20:00.000Z',
    })
    expect(next.conflicts).toEqual([
      { num: '001', field: 'wm1k', sheet: 'ほ', db: 'び', base: 'ひ' },
    ])
    expect(w.world.state.conflicts).toHaveLength(1)
  })

  it('dry-run は何も書かない', async () => {
    const w = fakeWorld({
      sheetCells: { '001': cells({ wm1k: 'ほ' }) },
      docs: { '001': doc() },
    })
    const plan = await runBisync({
      sheet: w.sheetIo,
      store: w.store,
      now: NOW,
      apply: false,
    })
    expect(plan.planned.db).toBe(1)
    expect(w.world.dbWrites).toEqual([])
    expect(w.world.base).toBeNull()
    expect(w.world.state).toBeNull()
  })

  it('番号指定の回は他の番号の積み残しを消さない', async () => {
    const w = fakeWorld({
      sheetCells: { '001': cells(), '002': cells() },
      docs: { '001': doc(), '002': doc({ num: '002' }) },
      base: { nums: {} },
      state: { cursor: NOW, lastFullAt: NOW, pending: ['002'], conflicts: [] },
    })
    await runBisync({
      sheet: w.sheetIo,
      store: w.store,
      now: LATER,
      only: ['001'],
    })
    expect(w.world.state.pending).toEqual(['002'])
    expect(w.world.state.cursor).toBe(NOW)
  })
})

describe('runBisync の状態', () => {
  it('全体を回し切れば前回のエラーを消し、番号指定の回では残す', async () => {
    const error = { at: NOW, message: 'boom' }
    const w = fakeWorld({
      sheetCells: { '001': cells() },
      docs: { '001': doc() },
      base: { nums: {} },
      state: { cursor: NOW, lastFullAt: NOW, lastError: error },
    })
    await runBisync({
      sheet: w.sheetIo,
      store: w.store,
      now: LATER,
      only: ['001'],
    })
    expect(w.world.state.lastError).toEqual(error)
    await runBisync({ sheet: w.sheetIo, store: w.store, now: LATER })
    expect(w.world.state.lastError).toBeNull()
  })
})

describe('runBisync の指紋', () => {
  it('流し終えた後の値で取るので、反映した直後もシートと DB が一致する', async () => {
    const w = fakeWorld({
      sheetCells: { '001': cells({ wm1k: 'ほ' }) },
      docs: { '001': doc() },
      base: { nums: {} },
      state: { cursor: NOW, lastFullAt: NOW },
    })
    await runBisync({ sheet: w.sheetIo, store: w.store, now: LATER })
    const { sheet, db } = w.world.state.sources
    expect(sheet.fingerprint).toHaveLength(200)
    expect(sheet.fingerprint).toBe(db.fingerprint)
    expect(sheet.contentUpdatedAt).toBe(LATER)
  })

  it('中身が変わらなければシートの内容の最終更新は進まない', async () => {
    const w = fakeWorld({
      sheetCells: { '001': cells() },
      docs: { '001': doc() },
      base: { nums: {} },
      state: { cursor: NOW, lastFullAt: NOW },
    })
    await runBisync({ sheet: w.sheetIo, store: w.store, now: NOW })
    await runBisync({ sheet: w.sheetIo, store: w.store, now: LATER })
    expect(w.world.state.sources.sheet.contentUpdatedAt).toBe(NOW)
  })
})
