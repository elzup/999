import { describe, expect, it, vi } from 'vitest'
import { ApiError, type NumberDoc, type PatchOp } from '../lib/numberApi'
import { NumberOpQueue, alreadyApplied } from '../lib/opQueue'
import { applyOpLocally } from '../lib/numberDetail'

const base = (num = '051', updatedAt = 't0'): NumberDoc => ({
  num,
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
const offline = () => new ApiError('通信できません', 0, true)
const conflict = () => new ApiError('conflict', 409, false)
const tick = () => new Promise((r) => setTimeout(r, 0))
const until = async (cond: () => boolean) => {
  for (let i = 0; i < 200 && !cond(); i++) await tick()
}

function setup(opts: { stored?: string | null } = {}) {
  // サーバ: 番号ごとの文書。送られた操作を当てて時刻を進める
  const server = new Map<string, NumberDoc>()
  let clock = 0
  const send = vi.fn(async (num: string, op: PatchOp, at: string | null) => {
    const cur = server.get(num) ?? base(num)
    if (cur.updatedAt !== at) throw conflict()
    const next = { ...applyOpLocally(cur, op), updatedAt: `s${++clock}` }
    server.set(num, next)
    return next
  })
  const read = vi.fn(async (num: string) => server.get(num) ?? base(num))
  const errors: string[] = []
  let stored: string | null = opts.stored ?? null
  const q = new NumberOpQueue({
    send,
    read,
    onChange: () => {},
    onSettled: () => {},
    onError: (num, message) => errors.push(`${num}:${message}`),
    storage: { load: () => stored, save: (text) => (stored = text) },
    savedMs: 60_000,
    backoffMs: () => 1,
  })
  return { q, send, read, server, errors, stored: () => stored }
}

describe('NumberOpQueue: 待たせない・捨てない保存', () => {
  it('押した瞬間に画面の文書へ反映して黄、送れたら緑', async () => {
    const { q } = setup()
    q.setBase(base())
    q.enqueue('051', [rep('鯉')])
    expect(q.view('051')?.rep?.picks).toEqual([{ k: 'こい', w: '鯉' }])
    expect(q.mark('051', 'rep')).toBe('pending')
    await until(() => q.pendingCount() === 0)
    expect(q.mark('051', 'rep')).toBe('saved')
  })

  it('圏外では捨てない: 黄のまま積んでおき、通るまで送り直す', async () => {
    const { q, send } = setup()
    q.setBase(base())
    send.mockRejectedValueOnce(offline()).mockRejectedValueOnce(offline())
    q.enqueue('051', [rep('鯉')])
    await until(() => send.mock.calls.length >= 3)
    await until(() => q.pendingCount() === 0)
    expect(send).toHaveBeenCalledTimes(3)
    expect(q.mark('051', 'rep')).toBe('saved')
  })

  it('圏外で失敗を知らせる時点の写しで、すでに «通信待ち» が立っている', async () => {
    const seen: boolean[] = []
    const send = vi.fn().mockRejectedValue(offline())
    const q: NumberOpQueue = new NumberOpQueue({
      send,
      read: async () => base(),
      onChange: () => seen.push(q?.snapshot().retrying ?? false),
      onSettled: () => {},
      onError: () => {},
      storage: { load: () => null, save: () => {} },
      // 送り直しが走ると retrying が下りるので、確かめる間は来ない長さにする
      backoffMs: () => 60_000,
    })
    q.setBase(base())
    q.enqueue('051', [rep('鯉')])
    await until(() => send.mock.calls.length >= 1 && q.retrying)
    expect(seen.at(-1)).toBe(true)
  })

  it('送り直しを待っている間に押した変更も積み続け、最後の状態を送る', async () => {
    const { q, send, server } = setup()
    q.setBase(base())
    send.mockRejectedValueOnce(offline())
    q.enqueue('051', [rep('鯉')])
    await until(() => q.retrying)
    q.enqueue('051', [rep('鯉太郎')])
    expect(q.view('051')?.rep?.picks[0].w).toBe('鯉太郎')
    await until(() => q.pendingCount() === 0)
    expect(server.get('051')?.rep?.picks[0].w).toBe('鯉太郎')
  })

  it('同じ番号は返事の時刻を前提に順に、違う番号は同時に送る', async () => {
    const { q, send } = setup()
    q.setBase(base('051'))
    q.setBase(base('052'))
    q.enqueue('051', [rep('鯉')])
    q.enqueue('051', [{ op: 'rating', k: 'こい', w: '鯉', v: 2 }])
    q.enqueue('052', [rep('鯉')])
    // 2 番号とも 1 つ目がすぐ出ている
    expect(send.mock.calls.map((c) => c[0])).toEqual(['051', '052'])
    await until(() => q.pendingCount() === 0)
    const calls051 = send.mock.calls.filter((c) => c[0] === '051')
    expect(calls051.map((c) => c[2])).toEqual([
      't0',
      expect.stringMatching(/^s/),
    ])
  })

  it('積んだ操作は端末に残り、開き直したら続きから送る', async () => {
    const first = setup()
    first.q.setBase(base())
    first.send.mockRejectedValue(offline())
    first.q.enqueue('051', [rep('鯉')])
    await until(() => first.q.retrying)
    // アプリを閉じて開き直す
    const second = setup({ stored: first.stored() })
    expect(second.q.pendingCount()).toBe(1)
    expect(second.q.mark('051', 'rep')).toBe('pending')
    await until(() => second.q.pendingCount() === 0)
    expect(second.server.get('051')?.rep?.picks[0].w).toBe('鯉')
  })

  it('本当の衝突 (409) は赤にして読み直す', async () => {
    const { q, server, errors } = setup()
    q.setBase(base())
    server.set('051', { ...base(), updatedAt: 'other' }) // 他の端末が先に書いた
    q.enqueue('051', [rep('鯉')])
    await until(() => q.pendingCount() === 0)
    expect(q.mark('051', 'rep')).toBe('error')
    expect(errors).toHaveLength(1)
    expect(q.view('051')?.updatedAt).toBe('other')
  })

  it('409 でも、サーバがすでに押したとおりなら成功とみなす (返事だけ落ちた)', async () => {
    const { q, server, errors } = setup()
    q.setBase(base())
    server.set('051', {
      ...applyOpLocally(base(), rep('鯉')),
      updatedAt: 'mine',
    })
    q.enqueue('051', [rep('鯉')])
    await until(() => q.pendingCount() === 0)
    expect(q.mark('051', 'rep')).toBe('saved')
    expect(errors).toHaveLength(0)
  })

  it('別の番号へ移す操作も積んで、移動元からすぐ消える', async () => {
    const { q, server } = setup()
    q.setBase(base('051'))
    server.set('052', { ...base('052'), slots: {} })
    q.enqueueMove('051', { row: { slot: 'wm1' }, to: '052' })
    expect(q.view('051')?.slots?.wm1).toBeUndefined()
    await until(() => q.pendingCount() === 0)
    expect(Object.values(server.get('052')?.slots ?? {})).toContainEqual(
      expect.objectContaining({ word: '鯉' })
    )
    expect(server.get('051')?.slots?.wm1).toBeUndefined()
  })
})

describe('NumberOpQueue: 移動と読み込みの順序', () => {
  it('遅れて届いた古い読み込みで、送った後の文書を上書きしない', async () => {
    const { q, server } = setup()
    // 時刻は ISO の文字列のように辞書順で新しさが分かる値にする (サーバは s1, s2 … と進める)
    server.set('051', base('051', 'r0'))
    q.setBase(base('051', 'r0'))
    q.enqueue('051', [rep('鯉')])
    await until(() => q.pendingCount() === 0)
    const saved = q.view('051')!
    expect(saved.updatedAt).toBe('s1')
    q.setBase(base('051', 'r0'))
    expect(q.view('051')?.updatedAt).toBe(saved.updatedAt)
    expect(q.view('051')?.rep?.picks).toEqual([{ k: 'こい', w: '鯉' }])
  })

  it('移す計画が立たなくても、同じ番号の後ろに積んだ操作は捨てない', async () => {
    const { q, server, errors } = setup()
    q.setBase(base('051'))
    // 移動先に同じ語があるので移せない
    server.set('052', base('052'))
    q.enqueueMove('051', { row: { slot: 'wm1' }, to: '052' })
    q.enqueue('051', [rep('鯉太郎')])
    await until(() => q.pendingCount() === 0)
    expect(errors).toEqual(['051:052 に同じ語があります'])
    expect(server.get('051')?.rep?.picks).toEqual([{ k: 'こい', w: '鯉太郎' }])
    expect(q.mark('051', 'slots')).toBe('error')
  })

  it('移動先に足す段の返事だけ落ちても、送り直しの 409 を成功とみなして続ける', async () => {
    const { q, server, send } = setup()
    q.setBase(base('051'))
    server.set('052', { ...base('052'), slots: {} })
    let dropped = false
    const real = send.getMockImplementation()!
    send.mockImplementation(async (num, op, at) => {
      const result = await real(num, op, at)
      // 移動先には届いたが返事が落ちた
      if (num === '052' && !dropped) {
        dropped = true
        throw offline()
      }
      return result
    })
    q.enqueueMove('051', { row: { slot: 'wm1' }, to: '052' })
    await until(() => q.pendingCount() === 0)
    expect(q.mark('051', 'slots')).toBe('saved')
    expect(Object.values(server.get('052')?.slots ?? {})).toHaveLength(1)
    expect(server.get('051')?.slots?.wm1).toBeUndefined()
  })
})

describe('alreadyApplied', () => {
  it('評価は値で比べ、null は無いこと', () => {
    const rated = applyOpLocally(base(), {
      op: 'rating',
      k: 'こい',
      w: '鯉',
      v: 2,
    })
    expect(
      alreadyApplied(rated, { op: 'rating', k: 'こい', w: '鯉', v: 2 })
    ).toBe(true)
    expect(
      alreadyApplied(base(), { op: 'rating', k: 'こい', w: '鯉', v: null })
    ).toBe(true)
  })
})
