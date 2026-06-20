import { h } from 'preact'
import { useState, useMemo } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import type { AllocItem, AllocMode } from '../lib/allocation'
import { buildAllocation, ALLOC_MODES } from '../lib/allocation'

type Props = {
  numbers: NumberEntry[]
}

const VALUES = Array.from({ length: 100 }, (_, v) => String(v).padStart(2, '0'))

function Bar({ items }: { items: AllocItem[] }) {
  return (
    <div class="alloc-bar">
      {items.map((it, i) => (
        <span
          key={i}
          class={'alloc-seg alloc-kind-' + it.kind}
          style={{ flexGrow: it.count }}
          title={`${it.key}=${it.count} (${it.kind})`}
        >
          <span class="alloc-seg-k">{it.key}</span>
          <span class="alloc-seg-c">{it.count}</span>
        </span>
      ))}
    </div>
  )
}

function AllocationGraph({ numbers }: Props) {
  const [mode, setMode] = useState<AllocMode>('_YZ')
  const alloc = useMemo(() => buildAllocation(numbers), [numbers])
  const data = alloc[mode]

  return (
    <div class="content alloc-panel">
      <div class="alloc-modes">
        {ALLOC_MODES.map((m) => (
          <button
            key={m}
            class={'alloc-mode-btn' + (m === mode ? ' active' : '')}
            onClick={() => setMode(m)}
          >
            {m}
          </button>
        ))}
      </div>
      <div class="alloc-legend">
        <span>
          <i class="alloc-sw alloc-kind-double" />
          2文字
        </span>
        <span>
          <i class="alloc-sw alloc-kind-single" />
          単独×2
        </span>
        <span>
          <i class="alloc-sw alloc-kind-mix" />
          mix
        </span>
        <span>
          <i class="alloc-sw alloc-kind-partial" />
          0省略
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
      <div class="alloc-grid">
        {VALUES.map((vv) => {
          const items = data[vv] ?? []
          const total = items.reduce((s, i) => s + i.count, 0)
          return (
            <div key={vv} class="alloc-row">
              <span class="alloc-vv">{vv}</span>
              <Bar items={items} />
              <span class="alloc-total">{total}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default AllocationGraph
