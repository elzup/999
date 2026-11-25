import { describe, expect, it, vi } from 'vitest'
import { ImageSaveQueue, stagesOf } from '../lib/imageSaveQueue'
import type { SlotImage } from '../lib/imagePicker'

const img = (hash: string): SlotImage => ({ url: `${hash}.webp`, hash })

function setup(api: Partial<Record<'setKeep' | 'pick' | 'recrop', any>> = {}) {
  const calls: string[] = []
  const shown: string[] = []
  const store = { text: null as string | null }
  const deps = {
    api: {
      setKeep:
        api.setKeep ??
        (async (_i: string, _s: string, on: boolean) => {
          calls.push(on ? 'keep' : 'unlock')
        }),
      pick:
        api.pick ??
        (async (_i: string, _s: string, hash: string) => {
          calls.push('pick')
          return img(hash + '-picked')
        }),
      recrop:
        api.recrop ??
        (async () => {
          calls.push('crop')
          return img('cropped')
        }),
    },
    onImage: (_job: unknown, image: SlotImage) => shown.push(image.url),
    isFatal: (err: unknown) => (err as Error).message === 'fatal',
    storage: {
      load: () => store.text,
      save: (text: string) => {
        store.text = text
      },
    },
    backoffMs: () => 0,
    savedMs: 60_000,
  }
  return { deps, calls, shown, store }
}

describe('ImageSaveQueue', () => {
  it('確定を外す → 採用 → 切り抜き → 確定 の順に送り、サーバの画像を画面へ返す', async () => {
    const { deps, calls, shown } = setup()
    const queue = new ImageSaveQueue(deps)
    queue.enqueue({
      id: '283',
      slot: 'w1',
      pick: img('a'),
      crop: { position: 'top' },
    })
    expect(queue.mark('283', 'w1')).toEqual({ state: 'pending' })
    await queue.idle()
    expect(calls).toEqual(['unlock', 'pick', 'crop', 'keep'])
    expect(shown).toEqual(['a-picked.webp', 'cropped.webp'])
    expect(queue.mark('283', 'w1')).toEqual({ state: 'saved' })
  })

  it('«これで良い» は確定だけを送る', () => {
    expect(stagesOf({ id: '1', slot: 'w1', keepOnly: true })).toEqual(['keep'])
    expect(stagesOf({ id: '1', slot: 'w1' })).toEqual(['unlock', 'keep'])
  })

  it('通信の失敗は捨てずに送り直し、済んだ段は繰り返さない', async () => {
    let fail = 1
    const { deps, calls } = setup({
      recrop: async () => {
        calls.push('crop')
        if (fail-- > 0) throw new Error('通信できません')
        return img('cropped')
      },
    })
    const queue = new ImageSaveQueue(deps)
    queue.enqueue({
      id: '283',
      slot: 'w1',
      pick: img('a'),
      crop: { position: 'top' },
    })
    await vi.waitFor(() => expect(queue.mark('283', 'w1')?.state).toBe('saved'))
    expect(calls).toEqual(['unlock', 'pick', 'crop', 'crop', 'keep'])
  })

  it('送り直しても通らない失敗は赤にして、同じ枠の次の保存は続ける', async () => {
    let first = true
    const { deps, calls } = setup({
      pick: async (_i: string, _s: string, hash: string) => {
        calls.push('pick:' + hash)
        if (first) {
          first = false
          throw new Error('fatal')
        }
        return img(hash)
      },
    })
    const queue = new ImageSaveQueue(deps)
    queue.enqueue({ id: '283', slot: 'w1', pick: img('a') })
    await queue.idle()
    expect(queue.mark('283', 'w1')).toEqual({
      state: 'error',
      message: 'fatal',
    })
    queue.enqueue({ id: '283', slot: 'w1', pick: img('b') })
    await queue.idle()
    expect(calls).toEqual(['unlock', 'pick:a', 'unlock', 'pick:b', 'keep'])
    expect(queue.mark('283', 'w1')?.state).toBe('saved')
  })

  it('端末に残した保存を、作り直したキューが続きの段から送る', async () => {
    const first = setup({
      setKeep: () => new Promise(() => {}), // 送り終わらないまま閉じた
    })
    new ImageSaveQueue(first.deps).enqueue({
      id: '283',
      slot: 'w1',
      pick: img('a'),
    })
    const saved = JSON.parse(first.store.text!)
    expect(saved).toEqual([
      { id: '283', slot: 'w1', pick: img('a'), stage: 'unlock' },
    ])

    const next = setup()
    next.store.text = first.store.text
    const queue = new ImageSaveQueue(next.deps)
    await queue.idle()
    expect(next.calls).toEqual(['unlock', 'pick', 'keep'])
    expect(JSON.parse(next.store.text!)).toEqual([])
  })
})
