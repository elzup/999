import { h } from 'preact'
import { useMemo } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import type { AllocItem, AllocMode, SelectedCell } from '../lib/allocation'
import { buildAllocation, ALLOC_MODES } from '../lib/allocation'

type Props = {
  numbers: NumberEntry[]
  mode: AllocMode
  sortBy: AllocSort
  extras: boolean
  onSelectCell: (cell: SelectedCell) => void
  selected?: SelectedCell | null
}

const VALUES = Array.from({ length: 100 }, (_, v) => String(v).padStart(2, '0'))

const KIND_COLOR: Record<string, string> = {
  double: '#60a5fa',
  single: '#4ade80',
  mix: '#fbbf24',
  partial: '#2dd4bf',
  fused: '#9ca3af',
  none: '#4b5563',
  error: '#ef4444',
}

// 背景 = グループ内シェア。高シェアほど明るい緑。
function shareBg(ratio: number) {
  const L = 20 + ratio * 48
  return {
    bg: `hsl(150 60% ${L.toFixed(0)}%)`,
    fg: L > 48 ? '#0f1117' : '#e5e7eb',
  }
}

export type AllocSort = 'count' | 'kana'

type ControlsProps = {
  mode: AllocMode
  sortBy: AllocSort
  extras: boolean
  onMode: (mode: AllocMode) => void
  onSort: (sortBy: AllocSort) => void
  onExtras: (extras: boolean) => void
}

// グラフの表示切り替え。親指が届くよう dock に置くので、グラフ本体とは分けて描く
export function AllocationControls({
  mode,
  sortBy,
  extras,
  onMode,
  onSort,
  onExtras,
}: ControlsProps) {
  return (
    <div class="alloc-ctrls">
      <div class="alloc-modes">
        {ALLOC_MODES.map((m) => (
          <button
            key={m}
            class={'alloc-mode-btn' + (m === mode ? ' active' : '')}
            onClick={() => onMode(m)}
          >
            {m}
          </button>
        ))}
      </div>
      <div class="alloc-toggle">
        <span class="alloc-tlabel">並び</span>
        {(['count', 'kana'] as const).map((s) => (
          <button
            key={s}
            class={'alloc-mini-btn' + (s === sortBy ? ' active' : '')}
            onClick={() => onSort(s)}
          >
            {s}
          </button>
        ))}
      </div>
      <div class="alloc-toggle">
        <span class="alloc-tlabel">枠</span>
        {(
          [
            ['base', '標準'],
            ['ext', '+予備'],
          ] as const
        ).map(([v, label]) => (
          <button
            key={v}
            class={
              'alloc-mini-btn' + ((v === 'ext') === extras ? ' active' : '')
            }
            onClick={() => onExtras(v === 'ext')}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  )
}

function AllocationGraph({
  numbers,
  mode,
  sortBy,
  extras,
  onSelectCell,
  selected,
}: Props) {
  const alloc = useMemo(
    () => buildAllocation(numbers, extras),
    [numbers, extras]
  )
  const data = alloc[mode]

  const sortItems = (items: AllocItem[]) => {
    const a = items.slice()
    if (sortBy === 'kana') a.sort((x, y) => x.key.localeCompare(y.key))
    else a.sort((x, y) => y.count - x.count || x.key.localeCompare(y.key))
    return a
  }

  // 凡例を下端 (操作の直上)、00 をその上に置き、99 へ向けて上へ積む
  return (
    <div class="stack-up" style={{ '--stack-gap': '10px' }}>
      <div class="alloc-legend">
        <span>
          背景=シェア 低<i class="alloc-grad" />高
        </span>
        <span class="alloc-lsep">下線=種別:</span>
        <span>
          <i class="alloc-sw alloc-kind-double" />
          2文字
        </span>
        <span>
          <i class="alloc-sw alloc-kind-single" />
          単独
        </span>
        <span>
          <i class="alloc-sw alloc-kind-mix" />
          mix
        </span>
        <span>
          <i class="alloc-sw alloc-kind-fused" />
          融合
        </span>
        <span>
          <i class="alloc-sw alloc-kind-none" />
          未登録
        </span>
      </div>
      <div class="alloc-grid stack-up" style={{ '--stack-gap': '0px' }}>
        {VALUES.map((vv) => {
          const items = sortItems(data[vv] ?? [])
          const total = items.reduce((s, i) => s + i.count, 0) || 1
          return (
            <div key={vv} class="alloc-row">
              <span class="alloc-vv">{vv}</span>
              <div class="alloc-bar">
                {items.map((it, i) => {
                  const ratio = it.count / total
                  const sc = shareBg(ratio)
                  const isSel =
                    selected &&
                    selected.mode === mode &&
                    selected.vv === vv &&
                    selected.key === it.key
                  return (
                    <span
                      key={i}
                      class={'alloc-seg' + (isSel ? ' sel' : '')}
                      style={{
                        flexGrow: it.count,
                        background: sc.bg,
                        color: sc.fg,
                        boxShadow: `inset 0 -3px 0 ${
                          KIND_COLOR[it.kind] ?? KIND_COLOR.none
                        }`,
                      }}
                      title={`${it.key}=${it.count} (${it.kind}, ${Math.round(
                        ratio * 100
                      )}%)`}
                      onClick={() =>
                        onSelectCell({
                          mode,
                          vv,
                          key: it.key,
                          kind: it.kind,
                          includeExtras: extras,
                        })
                      }
                    >
                      <span class="alloc-seg-k">{it.key}</span>
                      <span class="alloc-seg-c">{it.count}</span>
                    </span>
                  )
                })}
              </div>
              <span class="alloc-total">{total}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default AllocationGraph
