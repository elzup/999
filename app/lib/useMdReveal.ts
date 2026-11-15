// md カードの開き方 (UI 候補 B-2 / C-2)。
// 既定は «数字» = 番号だけ見せ、押すまで自分で思い出せる。押したカードは開いたまま残る。
// «全部» にすると全カードの画像と名前を出す。切り替えると押して開いた分は閉じ直す
import { useState } from 'preact/hooks'

export type MdRevealMode = 'num' | 'all'

export function useMdReveal() {
  const [mode, setModeState] = useState<MdRevealMode>('num')
  const [opened, setOpened] = useState<ReadonlySet<string>>(() => new Set())

  const setMode = (next: MdRevealMode) => {
    setModeState(next)
    setOpened(new Set())
  }
  const isOpen = (key: string) => mode === 'all' || opened.has(key)
  const reveal = (key: string) =>
    setOpened((prev) => (prev.has(key) ? prev : new Set([...prev, key])))

  return { mode, setMode, isOpen, reveal }
}
