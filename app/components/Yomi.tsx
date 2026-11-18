// よみの表示。記法 [す] (2 桁かなを 1 桁目だけで読む) の字には、読む数字を右肩に小さく添える (す³うる)。
// 記法 (ん) (読まないかな) の字は、薄く取り消し線で出す (さばんな の ん)。
// 正本の記法は src/kana-notation.js (D-0062)、見せ方は QA-0043 で A-4 に決めた。
import { parseNotation } from '../lib/kanaNotation'
import { halfDigit, useReadingTables } from '../lib/reading'

type Props = { kana: string; class?: string }

const Yomi = ({ kana, class: cls }: Props) => {
  const tables = useReadingTables()
  const segments = parseNotation(kana)
  // 括弧が壊れたよみは、直すきっかけになるよう書かれたまま出す
  if (!segments || segments.every((s) => !s.half && !s.skip)) {
    return <span class={cls}>{kana}</span>
  }
  return (
    <span class={cls}>
      {segments.map((s, i) =>
        s.skip ? (
          <span key={i} class="yomi-skip" title="読まないかな (中間の省略)">
            {s.text}
          </span>
        ) : s.half ? (
          <span key={i} class="yomi-half" title="2 桁のかなを 1 桁目だけで読む">
            {s.text}
            <sup class="yomi-half-digit">
              {(tables && halfDigit(tables, s.text)) ?? '?'}
            </sup>
          </span>
        ) : (
          s.text
        )
      )}
    </span>
  )
}

export default Yomi
