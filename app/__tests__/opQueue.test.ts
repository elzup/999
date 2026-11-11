import { describe, expect, it, vi } from 'vitest'
import type { NumberDoc, PatchOp } from '../lib/numberApi'
import { NumberOpQueue } from '../lib/opQueue'
import { applyOpLocally } from '../lib/numberDetail'

const base = (updatedAt = 't0'): NumberDoc => ({
  num: '051',
  slots: {
    wh1: { word: '鯉太郎', kana: 'こい' },
    wm1: { word: '鯉', kana: 'こい' },
  },
  rep: { picks: [], confirmed: false },
  ratings: [],
  updatedAt,
})
const rep = (w: string): PatchOp => ({
  op: 'rep',
  picks: [{ k: 'こい', w }],
  confirmed: true,
})

function setup() {
  let tick = 0
  const gates: Array<() => void> = []
  const send = vi.fn(
    (num: string, op: PatchOp, _at: string | null) =>
      new Promise<NumberDoc>((resolve) => {
        gates.push(() =>
          resolve({ ...applyOpLocally(base(), op), updatedAt: `t${++tick}` })
        )
      })
  )
  const settled: Array<[string, string | undefined]> = []
  const q = new NumberOpQueue({
    send,
    reload: async () => base('fresh'),
    onChange: () => {},
    onSettled: (num, message) => settled.push([num, message]),
    onError: () => {},
    savedMs: 60_000,
  })
  q.setBase(base())
  const release = async () => {
    gates.shift()?.()
    await new Promise((r) => setTimeout(r, 0))
  }
  return { q, send, settled, release }
}

describe('NumberOpQueue (編集画面の待たせない保存)', () => {
  it('押した瞬間に画面の文書へ反映し、黄 → 送れたら緑', async () => {
    const { q, release } = setup()
    q.enqueue('051', [rep('鯉')], '代表を確定しました')
    expect(q.view('051')?.rep?.picks).toEqual([{ k: 'こい', w: '鯉' }])
    expect(q.mark('051', 'rep')).toBe('pending')
    await release()
    await q.idle()
    expect(q.mark('051', 'rep')).toBe('saved')
  })

  it('送っている間に押した操作は、前の返事の時刻で順に送る', async () => {
    const { q, send, release, settled } = setup()
    q.enqueue('051', [rep('鯉')])
    q.enqueue('051', [{ op: 'rating', k: 'こい', w: '鯉', v: 2 }], '評価')
    await release()
    await release()
    await q.idle()
    expect(send.mock.calls.map((c) => c[2])).toEqual(['t0', 't1'])
    expect(settled).toEqual([['051', '評価']])
  })

  it('送信待ちの代表は最後の 1 回だけ送る (送信中の先頭は送る)', async () => {
    const { q, send, release } = setup()
    q.enqueue('051', [rep('鯉')]) // 送信中
    q.enqueue('051', [rep('鯉太郎')])
    q.enqueue('051', [rep('鯉')])
    expect(q.pendingCount('051')).toBe(2)
    await release()
    await release()
    await q.idle()
    expect(send).toHaveBeenCalledTimes(2)
  })

  it('失敗したら残りを捨てて赤にし、読み直した文書に戻す', async () => {
    const { q, send } = setup()
    send.mockRejectedValueOnce(new Error('conflict'))
    q.enqueue('051', [rep('鯉')])
    q.enqueue('051', [{ op: 'rating', k: 'こい', w: '鯉', v: 1 }])
    await q.idle()
    expect(q.mark('051', 'rep')).toBe('error')
    expect(q.mark('051', 'rating:こい|鯉')).toBe('error')
    expect(q.view('051')?.updatedAt).toBe('fresh')
    expect(q.pendingCount()).toBe(0)
  })
})

describe('applyOpLocally', () => {
  it('評価は同じ語を置き換え、null で消す', () => {
    const rated = applyOpLocally(base(), {
      op: 'rating',
      k: 'こい',
      w: '鯉',
      v: 2,
    })
    expect(rated.ratings).toEqual([{ k: 'こい', w: '鯉', v: 2 }])
    const cleared = applyOpLocally(rated, {
      op: 'rating',
      k: 'こい',
      w: '鯉',
      v: null,
    })
    expect(cleared.ratings).toEqual([])
  })
})

describe('NumberOpQueue.seed (先読み)', () => {
  it('持っていない番号だけ入れ、開いて読んだ文書は上書きしない', () => {
    const { q } = setup()
    q.seed([
      { ...base('old'), num: '051' },
      { ...base('t0'), num: '052' },
    ])
    expect(q.view('051')?.updatedAt).toBe('t0') // setup で読んだもの
    expect(q.has('052')).toBe(true)
  })
})
