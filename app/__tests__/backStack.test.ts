import { beforeEach, describe, expect, it, vi } from 'vitest'

// history と popstate を差し替えて、実ブラウザ無しで «戻る» の順序を検証する。
// ずれると «閉じるボタン 1 回でアプリが終了する» という最悪の壊れ方をするので、
// 目視ではなくテストで固定する。
const listeners: Array<() => void> = []
const stackDepth = { value: 0 }

vi.stubGlobal('window', {
  addEventListener: (type: string, fn: () => void) => {
    if (type === 'popstate') listeners.push(fn)
  },
  removeEventListener: () => {},
})
vi.stubGlobal('history', {
  pushState: () => {
    stackDepth.value += 1
  },
  back: () => {
    stackDepth.value -= 1
    // ブラウザは back() でも popstate を投げる
    listeners.forEach((fn) => fn())
  },
})

const { pushBack, resetBackStack, backStackSize } = await import(
  '../lib/backStack'
)

/** 端末の «戻る» */
const deviceBack = () => {
  stackDepth.value -= 1
  listeners.forEach((fn) => fn())
}

describe('backStack', () => {
  beforeEach(() => {
    resetBackStack()
    stackDepth.value = 0
  })

  it('戻るで一番上だけが閉じる', () => {
    const outer = vi.fn()
    const inner = vi.fn()
    pushBack(outer)
    pushBack(inner)

    deviceBack()

    expect(inner).toHaveBeenCalledOnce()
    expect(outer).not.toHaveBeenCalled()
    expect(backStackSize()).toBe(1)
  })

  it('自分で閉じたときは onBack を呼ばずに履歴だけ戻す', () => {
    const onBack = vi.fn()
    const release = pushBack(onBack)
    expect(stackDepth.value).toBe(1)

    release()

    expect(onBack).not.toHaveBeenCalled()
    expect(stackDepth.value).toBe(0)
    expect(backStackSize()).toBe(0)
  })

  it('閉じるボタン 1 回で履歴が 2 つ戻らない (アプリ終了の原因)', () => {
    const outer = vi.fn()
    pushBack(outer)
    const release = pushBack(vi.fn())

    release()

    // 外側はまだ生きている。ここで 0 になっているとアプリごと閉じる
    expect(stackDepth.value).toBe(1)
    expect(backStackSize()).toBe(1)
    expect(outer).not.toHaveBeenCalled()
  })

  it('戻るで閉じた後に release を呼んでも余計に戻らない', () => {
    const release = pushBack(vi.fn())

    deviceBack()
    expect(stackDepth.value).toBe(0)

    release()

    expect(stackDepth.value).toBe(0)
  })

  it('積んだ数だけ戻れば順に閉じる', () => {
    const order: string[] = []
    pushBack(() => order.push('a'))
    pushBack(() => order.push('b'))
    pushBack(() => order.push('c'))

    deviceBack()
    deviceBack()
    deviceBack()

    expect(order).toEqual(['c', 'b', 'a'])
    expect(backStackSize()).toBe(0)
  })
})
