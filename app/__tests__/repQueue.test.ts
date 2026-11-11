import { describe, expect, it, vi } from 'vitest'
import type { NumberDoc } from '../lib/numberApi'
import { RepSaveQueue, type RepChange } from '../lib/repQueue'

const doc = (num: string, updatedAt = 't0'): NumberDoc => ({
  num,
  slots: { wh1: { word: '鯉', kana: 'こい' } },
  rep: { picks: [], confirmed: false },
  updatedAt,
})
const change = (w: string): RepChange => ({
  picks: [{ k: 'こい', w }],
  confirmed: true,
})

function setup() {
  let tick = 0
  const send = vi.fn(async (num: string, c: RepChange, _at: string | null) => ({
    ...doc(num, `t${++tick}`),
    rep: c,
  }))
  const marks: Array<[string, string]> = []
  const saved: Array<[string, boolean]> = []
  const q = new RepSaveQueue({
    send,
    reload: async (num) => doc(num, 'fresh'),
    onSaved: (d, again) => saved.push([d.num, again]),
    onMark: (num, m) => marks.push([num, m]),
    onError: () => {},
    delayMs: 60_000, // テストでは flush を直接呼ぶ
  })
  return { q, send, marks, saved }
}

describe('RepSaveQueue (待たせない代表の保存)', () => {
  it('押した瞬間は «保存待ち»、送れたら «保存済み»', async () => {
    const { q, marks } = setup()
    q.enqueue(doc('101'), change('鯉'))
    expect(marks).toEqual([['101', 'pending']])
    await q.flush()
    expect(marks).toEqual([
      ['101', 'pending'],
      ['101', 'saved'],
    ])
  })

  it('同じ番号を続けて押したら、最後の状態だけを 1 回送る', async () => {
    const { q, send } = setup()
    q.enqueue(doc('101'), change('鯉'))
    q.enqueue(doc('101'), change('傘'))
    await q.flush()
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][1]).toEqual(change('傘'))
  })

  it('溜まった別々の番号は 1 回の flush でまとめて送る', async () => {
    const { q, send } = setup()
    q.enqueue(doc('101'), change('鯉'))
    q.enqueue(doc('102'), change('傘'))
    q.enqueue(doc('103'), change('鍋'))
    expect(q.pendingCount).toBe(3)
    await q.flush()
    expect(send.mock.calls.map((c) => c[0])).toEqual(['101', '102', '103'])
    expect(q.pendingCount).toBe(0)
  })

  it('送信中にまた押したら、返事の時刻で続けて送る (自分の保存と衝突しない)', async () => {
    const { q, send, saved } = setup()
    let release!: () => void
    send.mockImplementationOnce(
      (num, c) =>
        new Promise((resolve) => {
          release = () => resolve({ ...doc(num, 't1'), rep: c })
        })
    )
    q.enqueue(doc('101', 't0'), change('鯉'))
    const first = q.flush()
    q.enqueue(doc('101', 't0'), change('傘')) // 画面の doc はまだ古い時刻
    release()
    await first
    expect(send).toHaveBeenCalledTimes(2)
    expect(send.mock.calls[0][2]).toBe('t0')
    expect(send.mock.calls[1][2]).toBe('t1')
    // 1 回目の返事のときは次が待っていた
    expect(saved[0]).toEqual(['101', true])
  })

  it('失敗したら «失敗» にして、読み直した値で画面を戻す', async () => {
    const { q, send, marks, saved } = setup()
    send.mockRejectedValueOnce(new Error('他の画面が先に保存しました'))
    q.enqueue(doc('101'), change('鯉'))
    await q.flush()
    expect(marks.at(-1)).toEqual(['101', 'error'])
    expect(saved).toEqual([['101', false]])
  })
})
