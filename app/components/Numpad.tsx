import { h } from 'preact'
import { DIGIT_COLORS } from '../data/constants'
import TestPad, { type PadKey } from './TestPad'

type Props = {
  onTapDigit: (digit: number) => void
  colored?: boolean
  /** 出す最大の数字。0-6 のテスト (年コード) は 6 を渡す */
  maxDigit?: number
  onBackspace?: () => void
  backspaceDisabled?: boolean
  /** パッドの上に置くもの (TestNavBar など) */
  header?: h.JSX.Element | null
}

/**
 * 数字テンキー。1..maxDigit を並べ、0 は最下段に置く。
 * ⌫ を出すときは 0 を中央のままにして左を空ける (指の位置を変えないため)。
 */
function Numpad({
  onTapDigit,
  colored,
  maxDigit = 9,
  onBackspace,
  backspaceDisabled,
  header,
}: Props) {
  const digit = (n: number): PadKey => ({
    value: String(n),
    color: colored ? DIGIT_COLORS[n] : undefined,
  })
  const keys: PadKey[] = [
    ...Array.from({ length: maxDigit }, (_, i) => digit(i + 1)),
    ...(onBackspace ? [{ value: 'spacer', spacer: true } as PadKey] : []),
    { ...digit(0), col: onBackspace ? undefined : 2 },
  ]

  return (
    <TestPad
      keys={keys}
      cols={3}
      onPress={(value) => onTapDigit(Number(value))}
      onBackspace={onBackspace}
      backspaceDisabled={backspaceDisabled}
      header={header}
    />
  )
}

export default Numpad
