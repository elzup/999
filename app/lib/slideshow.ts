// スライドショーの純粋ロジック。履歴 (直近を保持) と「次へ / 戻る」の遷移を
// 副作用なしで扱い、テストしやすくする。表示中アイテムは history[pos]。

export type SlideMode = 'order' | 'random'

// 自動送りの速度3段階 (ms)。index 0=遅い / 1=普通 / 2=速い。
export const SLIDE_SPEEDS = [6000, 3500, 1800] as const
export const SLIDE_SPEED_LABELS = ['遅い', '普通', '速い'] as const

// 「一つ前に戻る」は最大5個まで。現在 + 過去5 = 6 件を保持する。
export const MAX_BACK = 5
export const HISTORY_CAP = MAX_BACK + 1

export type SlideState = {
  // 表示済みアイテムの id 列 (古い→新しい)。最大 HISTORY_CAP 件。
  history: string[]
  // history 内の現在位置。
  pos: number
}

export const EMPTY_SLIDE: SlideState = { history: [], pos: 0 }

function randomIndex(
  len: number,
  currentId: string | undefined,
  pool: string[],
  rand: () => number
): number {
  if (len <= 1) return 0
  // 直前と同じは避ける (無限ループしないよう試行回数を制限)。
  let idx = 0
  for (let guard = 0; guard < 20; guard++) {
    idx = Math.floor(rand() * len)
    if (pool[idx] !== currentId) break
  }
  return idx
}

/** プールとモードから初期状態を作る。 */
export function initSlide(
  pool: string[],
  mode: SlideMode,
  rand: () => number = Math.random
): SlideState {
  if (pool.length === 0) return EMPTY_SLIDE
  const idx =
    mode === 'random' ? randomIndex(pool.length, undefined, pool, rand) : 0
  return { history: [pool[idx]], pos: 0 }
}

/**
 * 次のアイテムへ。履歴の途中 (戻った状態) なら履歴を前進、
 * 先端なら新しいアイテムを生成して追加する。履歴は HISTORY_CAP 件で打ち切る。
 */
export function advance(
  state: SlideState,
  pool: string[],
  mode: SlideMode,
  rand: () => number = Math.random
): SlideState {
  if (pool.length === 0) return state
  if (state.history.length === 0) return initSlide(pool, mode, rand)

  // 戻っている途中なら、記憶済みの履歴を前進するだけ。
  if (state.pos < state.history.length - 1) {
    return { history: state.history, pos: state.pos + 1 }
  }

  const current = state.history[state.pos]
  let nextIdx: number
  if (mode === 'order') {
    const base = pool.indexOf(current)
    nextIdx = base < 0 ? 0 : (base + 1) % pool.length
  } else {
    nextIdx = randomIndex(pool.length, current, pool, rand)
  }

  let history = [...state.history, pool[nextIdx]]
  let pos = state.pos + 1
  if (history.length > HISTORY_CAP) {
    history = history.slice(history.length - HISTORY_CAP)
    pos = history.length - 1
  }
  return { history, pos }
}

/** 一つ前へ戻る。先頭なら何もしない。 */
export function goBack(state: SlideState): SlideState {
  if (state.pos <= 0) return state
  return { history: state.history, pos: state.pos - 1 }
}

export function currentId(state: SlideState): string | null {
  return state.history[state.pos] ?? null
}

export function canGoBack(state: SlideState): boolean {
  return state.pos > 0
}
