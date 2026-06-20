import { h } from 'preact'
import { useMemo } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import type { SelectedCell } from '../lib/allocation'
import { getCellWords } from '../lib/allocation'

type Props = {
  numbers: NumberEntry[]
  selected: SelectedCell | null
  onPickNum?: (num: string) => void
}

function CellWords({ numbers, selected, onPickNum }: Props) {
  const words = useMemo(
    () =>
      selected
        ? getCellWords(
            numbers,
            selected.mode,
            selected.vv,
            selected.key,
            selected.includeExtras
          )
        : [],
    [numbers, selected]
  )

  if (!selected) {
    return (
      <div class="cellwords empty">
        セルをタップすると該当する語が表示されます
      </div>
    )
  }

  return (
    <div class="cellwords">
      <div class="cellwords-head">
        <span class="cellwords-mode">{selected.mode}</span>
        <span class="cellwords-vv">{selected.vv}</span>
        <span class={'cellwords-key alloc-kind-' + selected.kind}>
          {selected.key}
        </span>
        <span class="cellwords-count">{words.length} 語</span>
      </div>
      {words.length === 0 ? (
        <div class="cellwords-none">該当語なし</div>
      ) : (
        <div class="cellwords-list">
          {words.map((w, i) => (
            <button
              key={i}
              class="cellwords-item"
              onClick={() => onPickNum?.(w.num)}
            >
              <span class="cellwords-num">{w.num}</span>
              <span class="cellwords-word">{w.word}</span>
              <span class="cellwords-slot">{w.slot}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export default CellWords
