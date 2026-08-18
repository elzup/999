// rankey (3桁の内訳記法) を記号ごとの色で表示する。
// 数値スコア1つでは分からない「どの桁がどう賄われているか」を読ませる。
// 記号の意味は src/rankey.js を参照。

// x(拗音) は減点ではないので A/B と同じ良い側の色に置く
const CLASS_OF: Record<string, string> = {
  A: 'rk-a',
  B: 'rk-b',
  C: 'rk-c',
  w: 'rk-w',
  x: 'rk-x',
  t: 'rk-t',
  v: 'rk-v',
  _: 'rk-u',
  '!': 'rk-o',
  '|': 'rk-s',
  n: 'rk-f',
  '-': 'rk-f',
  '.': 'rk-f',
  m: 'rk-m',
}

type Props = { value: string; title?: string }

const Rankey = ({ value, title }: Props) => {
  if (!value) return null
  return (
    <span class="rk" title={title ?? `rankey ${value}`}>
      {[...value].map((ch, i) => (
        <span key={i} class={CLASS_OF[ch] ?? ''}>
          {ch}
        </span>
      ))}
    </span>
  )
}

export default Rankey
