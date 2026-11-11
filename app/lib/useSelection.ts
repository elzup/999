import { useCallback, useMemo, useState } from 'preact/hooks'
import { useBackGuard } from './useBackGuard'

/** 詳細パネルの «前へ / 次へ»。端では null (ボタンは押せない) */
export type SelectionNav = {
  onPrev: (() => void) | null
  onNext: (() => void) | null
  /** ボタンに出す行き先 (番号など)。省略時は «前へ» «次へ» だけ */
  prevLabel?: string
  nextLabel?: string
}

/**
 * 一覧・マップで 1 つを選んで詳細パネルを開く画面の選択状態。
 *
 * 画面ごとに useState で書いていたら、同じ «番号を選ぶ» なのに
 * 再タップで外れる / 外れない、戻るで閉じる / アプリごと閉じる が画面で食い違った。
 * 選択の振る舞いはここだけで決める。
 *
 * - toggle: 選択中の同じものをもう一度タップすると外す
 * - 選択中は端末の «戻る» で閉じる (Android のジェスチャーナビでアプリが終了しないように)
 * - order を渡すと、その並び (= 画面に出ている順) で前後へ送る nav を返す
 */
export function useSelection<K>(
  order?: readonly K[],
  labelOf: (key: K) => string = String
) {
  const [selected, setSelected] = useState<K | null>(null)

  const clear = useCallback(() => setSelected(null), [])
  const toggle = useCallback(
    (key: K) => setSelected((cur) => (cur === key ? null : key)),
    []
  )

  useBackGuard(selected !== null, clear)

  const nav = useMemo<SelectionNav | undefined>(() => {
    if (!order || selected === null) return undefined
    return navAround(order, selected, setSelected, labelOf)
    // labelOf は呼び出し側で毎回作られがちなので依存に入れない
  }, [order, selected])

  return { selected, select: setSelected, toggle, clear, nav }
}

/** order の中で current の前後へ送る nav。current が order に無ければ先頭 / 末尾へ */
export function navAround<K>(
  order: readonly K[],
  current: K,
  go: (key: K) => void,
  labelOf: (key: K) => string = String
): SelectionNav {
  const i = order.indexOf(current)
  const prev = i > 0 ? order[i - 1] : null
  const next =
    i >= 0 ? (i < order.length - 1 ? order[i + 1] : null) : (order[0] ?? null)
  return {
    onPrev: prev === null ? null : () => go(prev),
    onNext: next === null ? null : () => go(next),
    prevLabel: prev === null ? undefined : labelOf(prev),
    nextLabel: next === null ? undefined : labelOf(next),
  }
}
