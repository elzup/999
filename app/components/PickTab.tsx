// 候補タブ。代表を選ぶ一覧 (RepPickerTab) と画像を選ぶ一覧 (CandidateTab) を dock の
// [代表 | 画像] で切り替える。百の位は共有し、切り替えたら見ていた番号の位置で開く
// (代表を見ながら画像を直し、また代表に戻る、を行き来しやすくする)。
import { useRef, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { loadSubTab, saveSubTab } from '../data/storage'
import { visibleAnchorNum } from '../lib/pickPosition'
import CandidateTab from './CandidateTab'
import RepPickerTab from './RepPickerTab'

const MODE_KEY = 'pick.mode'
const MODES = ['rep', 'image'] as const
type Mode = (typeof MODES)[number]
const MODE_LABELS: Record<Mode, string> = { rep: '代表', image: '画像' }

type Props = { token: string; numbers: NumberEntry[] }

export default function PickTab({ token, numbers }: Props) {
  const [mode, setMode] = useState<Mode>(() =>
    loadSubTab(MODE_KEY, MODES, 'image')
  )
  // 切り替える直前に見ていた番号。切り替えた先がこの番号の位置で開く
  const anchor = useRef<string | null>(null)

  const switchTo = (next: Mode) => {
    if (next === mode) return
    anchor.current = visibleAnchorNum()
    saveSubTab(MODE_KEY, next)
    setMode(next)
  }

  const modeSwitch = (
    <span class="pick-modes" role="group" aria-label="代表と画像の切り替え">
      {MODES.map((m) => (
        <button
          key={m}
          type="button"
          class={'rp-seg pick-mode' + (mode === m ? ' active' : '')}
          aria-pressed={mode === m}
          onClick={() => switchTo(m)}
        >
          {MODE_LABELS[m]}
        </button>
      ))}
    </span>
  )

  return mode === 'rep' ? (
    <RepPickerTab
      key="rep"
      token={token}
      numbers={numbers}
      modeSwitch={modeSwitch}
      anchor={anchor.current}
    />
  ) : (
    <CandidateTab
      key="image"
      token={token}
      modeSwitch={modeSwitch}
      anchor={anchor.current}
    />
  )
}
