import { useCallback, useState } from 'preact/hooks'
import { useBackGuard } from './useBackGuard'

/**
 * 一覧・マップで 1 つを選んで詳細パネルを開く画面の選択状態。
 *
 * 画面ごとに useState で書いていたら、同じ «番号を選ぶ» なのに
 * 再タップで外れる / 外れない、戻るで閉じる / アプリごと閉じる が画面で食い違った。
 * 選択の振る舞いはここだけで決める。
 *
 * - toggle: 選択中の同じものをもう一度タップすると外す
 * - 選択中は端末の «戻る» で閉じる (Android のジェスチャーナビでアプリが終了しないように)
 */
export function useSelection<K>(initial: K | null = null) {
  const [selected, setSelected] = useState<K | null>(initial)

  const clear = useCallback(() => setSelected(null), [])
  const toggle = useCallback(
    (key: K) => setSelected((cur) => (cur === key ? null : key)),
    []
  )

  useBackGuard(selected !== null, clear)

  return { selected, select: setSelected, toggle, clear }
}
