import { h } from 'preact'

export type SegOption<Id extends string> = { id: Id; label: string }

/**
 * 1 つだけ選ぶ切り替え (セグメントコントロール、UI 案 A-1: 溝の中で選択だけ板が浮く)。
 *
 * 丸いボタンを 1 列に並べていたら、どこまでが 1 つの選択でどれが別の絞り込みかが
 * 見えなかった (候補タブの 対象 と 状態)。選択肢を 1 本の溝に繋げて区切る。
 * 選択肢が多いときは cols で折り返す (横スクロールだと隠れた選択肢に気づけない)
 */
export function Segmented<Id extends string>({
  label,
  ariaLabel,
  options,
  value,
  onChange,
  cols,
}: {
  /** 左に出す見出し。省略時は出さない */
  label?: string
  /** 見出しを出さないときの読み上げ名 */
  ariaLabel?: string
  options: readonly SegOption<Id>[]
  value: Id
  onChange: (id: Id) => void
  /** 1 行に並べる数。省略時は全部を 1 行 */
  cols?: number
}) {
  const seg = (
    <div
      class={'seg' + (cols ? ' seg-wrap' : '')}
      style={cols ? { '--seg-cols': cols } : undefined}
      role="radiogroup"
      aria-label={label ?? ariaLabel}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="radio"
          aria-checked={value === opt.id}
          class={'seg-opt' + (value === opt.id ? ' active' : '')}
          onClick={() => onChange(opt.id)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
  if (!label) return seg
  return (
    <div class="seg-row">
      <span class="seg-row-label">{label}</span>
      {seg}
    </div>
  )
}
