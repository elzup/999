import { h } from 'preact'
import { DockRow } from './Screen'
import { Segmented } from './Segmented'
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
      <Segmented
        ariaLabel="語の出し方"
        options={[
          { id: 'num', label: '数字' },
          { id: 'all', label: '全部' },
        ]}
        value={mode}
        onChange={onChange}
      />
    </DockRow>
  )
}
