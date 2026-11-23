import { h } from 'preact'
import { DockRow } from './Screen'
import type { MdRevealMode } from '../lib/useMdReveal'

const OPTIONS: { mode: MdRevealMode; label: string }[] = [
  { mode: 'num', label: '数字だけ' },
  { mode: 'all', label: '全部見せる' },
]

/**
 * Dock の md カードの見せ方。ボタン 2 つ並びだと絞り込み (filter) に見えて
 * 何を切り替えるのか分かりにくかったので、見出し付きのラジオにする
 */
export function MdRevealToggle({
  mode,
  onChange,
}: {
  mode: MdRevealMode
  onChange: (mode: MdRevealMode) => void
}) {
  return (
    <DockRow>
      <div class="md-reveal" role="radiogroup" aria-label="カードの見せ方">
        <span class="dock-row-label">カード:</span>
        {OPTIONS.map((opt) => (
          <label
            key={opt.mode}
            class={'md-reveal-opt' + (mode === opt.mode ? ' active' : '')}
          >
            <input
              type="radio"
              name="md-reveal"
              checked={mode === opt.mode}
              onChange={() => onChange(opt.mode)}
            />
            {opt.label}
          </label>
        ))}
      </div>
    </DockRow>
  )
}
