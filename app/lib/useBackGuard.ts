import { useEffect, useRef } from 'preact/hooks'
import { pushBack } from './backStack'

/**
 * active な間だけ «戻る» を onBack に割り当てる。
 *
 * 自分のボタンで閉じた場合は active が false になり、cleanup が積んだ履歴を
 * 巻き戻す。戻るで閉じられた場合は既にスタックから消えているので、巻き戻しは
 * 空振りする。どちらの経路でも履歴の深さが揃う。
 */
export function useBackGuard(active: boolean, onBack: () => void) {
  // onBack が毎レンダー変わっても積み直さない (積み直すと履歴が増える)
  const handler = useRef(onBack)
  handler.current = onBack

  useEffect(() => {
    if (!active) return
    return pushBack(() => handler.current())
  }, [active])
}
