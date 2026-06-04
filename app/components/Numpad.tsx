import { h } from 'preact'
import { DIGIT_COLORS } from '../data/constants'
import { vibrate } from '../lib/haptics'

type Props = {
  onTapDigit: (digit: number) => void
  colored?: boolean
  maxDigit?: number
  onBackspace?: () => void
  backspaceDisabled?: boolean
}

// 共通テンキー。タップ時に振動し、onBackspace を渡すと ⌫ キーを表示する。
function Numpad({
  onTapDigit,
  colored,
  maxDigit = 9,
  onBackspace,
  backspaceDisabled,
}: Props) {
  const digits = Array.from({ length: maxDigit }, (_, i) => i + 1)

  const handleDigit = (digit: number) => {
    vibrate()
    onTapDigit(digit)
  }

  const handleBackspace = () => {
    if (backspaceDisabled) return
    vibrate()
    onBackspace?.()
  }

  return (
    <div
      style={{
        flexShrink: 0,
        background: 'var(--surface)',
        borderTop: '1px solid var(--border)',
        padding: '8px 12px',
      }}
    >
      <div class="np-numpad">
        {digits.map((digit) => (
          <div
            key={digit}
            class="np-numkey"
            style={colored ? { color: DIGIT_COLORS[digit] } : {}}
            onClick={() => handleDigit(digit)}
          >
            {digit}
          </div>
        ))}
        {onBackspace ? (
          <div class="np-numkey np-empty" aria-hidden="true" />
        ) : null}
        <div
          key={0}
          class={'np-numkey' + (onBackspace ? '' : ' zero')}
          style={colored ? { color: DIGIT_COLORS[0] } : {}}
          onClick={() => handleDigit(0)}
        >
          0
        </div>
        {onBackspace ? (
          <div
            class={'np-numkey np-back' + (backspaceDisabled ? ' disabled' : '')}
            onClick={handleBackspace}
          >
            ⌫
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default Numpad
