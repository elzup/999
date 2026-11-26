import { describe, expect, it } from 'vitest'
import {
  createSymbolStore,
  numberDocOf,
  pendingCountOf,
  saveMarkOf,
} from '../lib/symbolStore'
import type { NumberDoc } from '../lib/numberApi'
import type { QueueSnapshot } from '../lib/opQueue'

const doc = (over: Partial<NumberDoc> & Record<string, unknown> = {}) =>
  ({
    num: '106',
    hito: 'トロ',
    mono: 'トロ,泥',
    slots: {
      wh1: { word: 'トロ', kana: 'とろ' },
      wm1: { word: 'トロ', kana: 'とろ' },
      wm2: { word: '泥', kana: 'どろ' },
    },
    rep: { picks: [], confirmed: false },
    updatedAt: '2026-11-26T00:00:00.000Z',
    ...over,
  } as NumberDoc)

const snapshot = (over: Partial<QueueSnapshot> = {}): QueueSnapshot => ({
  base: [],
  pending: [],
  marks: {},
  retrying: false,
  ...over,
})

describe('symbolStore', () => {
  it('サーバの文書を symbol に直して持ち、同じ文書に戻して出す', () => {
    const store = createSymbolStore()
    const base = doc()
    store.getState().syncQueue(snapshot({ base: [base] }))
    expect(store.getState().symbols['n:106']).toBeDefined()
    expect(numberDocOf(store.getState(), '106')).toEqual(base)
  })

  it('保存待ちの操作を重ねて出す (キューの view と同じ)', () => {
    const store = createSymbolStore()
    store.getState().syncQueue(
      snapshot({
        base: [doc()],
        pending: [
          {
            num: '106',
            key: 'rep',
            op: { op: 'rep', picks: [{ k: 'どろ', w: '泥' }], confirmed: true },
          },
        ],
        marks: { '106:rep': 'pending' },
      })
    )
    const state = store.getState()
    expect(numberDocOf(state, '106')?.rep).toEqual({
      picks: [{ k: 'どろ', w: '泥' }],
      confirmed: true,
    })
    expect(pendingCountOf(state, '106')).toBe(1)
    expect(pendingCountOf(state, '107')).toBe(0)
    expect(saveMarkOf(state, '106', 'rep')).toBe('pending')
  })

  it('同じ入力なら同じオブジェクトを返す (購読している画面を描き直さない)', () => {
    const store = createSymbolStore()
    const base = doc()
    store.getState().syncQueue(snapshot({ base: [base] }))
    const first = numberDocOf(store.getState(), '106')
    // キューは変わるたびに全件を渡す。中身が同じなら symbol も文書も同じものを使う
    store.getState().syncQueue(snapshot({ base: [base] }))
    expect(numberDocOf(store.getState(), '106')).toBe(first)
  })

  it('symbol に直すと戻らない文書 (枠だけ先に保存した直後) は、そのまま出す', () => {
    const store = createSymbolStore()
    // 枠 wh2 にある語が、人の一覧にまだ無い (saveSlots は slots だけを書く)
    const ahead = doc({
      slots: {
        wh1: { word: 'トロ', kana: 'とろ' },
        wh2: { word: '泥棒', kana: 'どろぼう' },
      },
    })
    store.getState().syncQueue(snapshot({ base: [ahead] }))
    expect(store.getState().rawDocs['106']).toBe(ahead)
    expect(numberDocOf(store.getState(), '106')).toBe(ahead)
  })

  it('読んでいない番号は null', () => {
    const store = createSymbolStore()
    expect(numberDocOf(store.getState(), '999')).toBeNull()
  })
})
