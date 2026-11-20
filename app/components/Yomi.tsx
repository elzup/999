// よみの表示。書かれたままの字を出す (半指定のカタカナ ス、読まないかなの半角カナ ﾝ)。
// 読まないかなは数字にしないことが分かるよう薄く出す。読む数字は添えない (ツ² のような別の見た目を作らない)。
// 記法の仕様は docs/kana-notation.md (D-0093)。
import { parseNotation } from '../lib/kanaNotation'

type Props = { kana: string; class?: string }

const Yomi = ({ kana, class: cls }: Props) => {
  const segments = parseNotation(kana)
  if (!segments || segments.every((s) => !s.skip)) {
    return <span class={cls}>{kana}</span>
  }
  return (
    <span class={cls}>
      {segments.map((s, i) =>
        s.skip ? (
          <span key={i} class="yomi-skip" title="読まないかな">
            {s.text}
          </span>
        ) : (
          s.text
        )
      )}
    </span>
  )
}

export default Yomi
