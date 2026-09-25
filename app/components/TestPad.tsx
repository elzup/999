import { h } from 'preact'
import { vibrate } from '../lib/haptics'

/**
 * テストの入力パッド (全テスト共通)。
 * 数字 (0-9 / 0-6)・hex・bin・4択 のいずれもこの 1 部品で組む。
 * 以前は Numpad / YearTab の自前コピー / .d3-numpad / KeypadQuiz のインライン style と
 * 4 実装に散っていて、キーの大きさも位置も揃わなかった。
 */

export type PadKey = {
  /** onPress に渡す値 */
  value: string
  /** 表示。省略時は value */
  label?: string
  color?: string
  disabled?: boolean
  /** 置く列 (1 始まり)。0 の位置合わせなどに使う */
  col?: number
  /** 空きマス (押せないダミー) */
  spacer?: boolean
}

type Props = {
  keys: PadKey[]
  cols: number
  onPress: (value: string) => void
  /** ⌫ を出す。渡さなければキーは出ない */
  onBackspace?: () => void
  backspaceDisabled?: boolean
  /** パッドの上に置くもの (TestNavBar など) */
  header?: h.JSX.Element | null
}

function TestPad({
  keys,
  cols,
  onPress,
  onBackspace,
  backspaceDisabled,
  header,
}: Props) {
  const press = (key: PadKey) => {
    if (key.disabled) return
    vibrate()
    onPress(key.value)
  }

  const back = () => {
    if (backspaceDisabled) return
    vibrate()
    onBackspace?.()
  }

  return (
    <div class="test-pad">
      {header}
      <div
        class="test-pad-grid"
        style={{ gridTemplateColumns: `repeat(${cols}, 1fr)` }}
      >
        {keys.map((key, i) =>
          key.spacer ? (
            <span key={'spacer' + i} class="test-pad-key is-spacer" />
          ) : (
            <button
              key={key.value}
              class="test-pad-key"
              disabled={key.disabled}
              style={{
                ...(key.color ? { color: key.color } : {}),
                ...(key.col ? { gridColumn: String(key.col) } : {}),
              }}
              onClick={() => press(key)}
            >
              {key.label ?? key.value}
            </button>
          )
        )}
        {onBackspace ? (
          <button
            class="test-pad-key is-back"
            disabled={backspaceDisabled}
            onClick={back}
          >
            ⌫
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default TestPad
