import { h } from 'preact'
import { useState } from 'preact/hooks'
import type { NumberEntry, RulesData } from '../data/schema'
import type { SelectedCell } from '../lib/allocation'
import RecallTreePanel from './RecallTreePanel'
import AllocationGraph from './AllocationGraph'
import CellWords from './CellWords'

type Props = {
  numbers: NumberEntry[]
  rules: RulesData
}

function RecallTab({ numbers, rules }: Props) {
  const [cell, setCell] = useState<SelectedCell | null>(null)
  const [treeNum, setTreeNum] = useState<string | null>(null)

  const selectCell = (c: SelectedCell) => {
    setCell(c)
    setTreeNum(null)
  }

  return (
    <div class="recall-split">
      <div class="recall-split-graph">
        <AllocationGraph
          numbers={numbers}
          onSelectCell={selectCell}
          selected={cell}
        />
      </div>
      <div class="recall-split-detail">
        {treeNum ? (
          <RecallTreePanel
            numbers={numbers}
            rules={rules}
            initialNum={treeNum}
            onBack={() => setTreeNum(null)}
          />
        ) : (
          <CellWords numbers={numbers} selected={cell} onPickNum={setTreeNum} />
        )}
      </div>
    </div>
  )
}

export default RecallTab
