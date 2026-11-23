import { h } from 'preact'
import { DockRow } from './Screen'
import type { MdRevealMode } from '../lib/useMdReveal'

/** Dock の «数字 | 全部» の切り替え (UI 候補 B-2) */
export function MdRevealToggle({
  mode,
  onChange,
}: {
  mode: MdRevealMode
  onChange: (mode: MdRevealMode) => void
}) {
  return (
    <DockRow>
      <button
        class={'filter-btn' + (mode === 'num' ? ' active' : '')}
        aria-pressed={mode === 'num'}
        onClick={() => onChange('num')}
      >
        数字
      </button>
      <button
        class={'filter-btn' + (mode === 'all' ? ' active' : '')}
        aria-pressed={mode === 'all'}
        onClick={() => onChange('all')}
      >
        全部
      </button>
    </DockRow>
  )
}
