import { h } from 'preact'
import { useState } from 'preact/hooks'
import type { NumberEntry, RulesData } from '../data/schema'
import type { AllocMode, SelectedCell } from '../lib/allocation'
import RecallTreePanel, { RecallTreeInput } from './RecallTreePanel'
import AllocationGraph, {
  AllocationControls,
  type AllocSort,
} from './AllocationGraph'
import CellWords from './CellWords'
import Screen, { DockBar, QuitButton } from './Screen'

type Props = {
  numbers: NumberEntry[]
  rules: RulesData
}

function RecallTab({ numbers, rules }: Props) {
  const [cell, setCell] = useState<SelectedCell | null>(null)
  const [treeNum, setTreeNum] = useState<string | null>(null)
  // 入力欄は dock、ツリーは panel に分かれるので、入力値はここで持つ
  const [treeInput, setTreeInput] = useState('')
  const [mode, setMode] = useState<AllocMode>('_YZ')
  const [sortBy, setSortBy] = useState<AllocSort>('count')
  const [extras, setExtras] = useState(false)

  const selectCell = (c: SelectedCell) => {
    setCell(c)
    setTreeNum(null)
  }

  const openTree = (num: string) => {
    setTreeInput(num)
    setTreeNum(num)
  }

  const panel = treeNum ? (
    <RecallTreePanel numbers={numbers} rules={rules} input={treeInput} />
  ) : (
    // 語の一覧は下から積むので、スクロールの初期位置も下端にする
    <div class="recall-detail">
      <CellWords numbers={numbers} selected={cell} onPickNum={openTree} />
    </div>
  )

  const dock = (
    <>
      {treeNum ? (
        <DockBar>
          <RecallTreeInput value={treeInput} onChange={setTreeInput} />
          <QuitButton label="一覧" onClick={() => setTreeNum(null)} />
        </DockBar>
      ) : null}
      <AllocationControls
        mode={mode}
        sortBy={sortBy}
        extras={extras}
        onMode={setMode}
        onSort={setSortBy}
        onExtras={setExtras}
      />
    </>
  )

  return (
    <Screen
      main={
        <AllocationGraph
          numbers={numbers}
          mode={mode}
          sortBy={sortBy}
          extras={extras}
          onSelectCell={selectCell}
          selected={cell}
        />
      }
      panel={panel}
      dock={dock}
    />
  )
}

export default RecallTab
