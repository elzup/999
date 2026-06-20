import { h } from 'preact'
import { useState } from 'preact/hooks'
import type { NumberEntry, RulesData } from '../data/schema'
import RecallTreePanel from './RecallTreePanel'
import AllocationGraph from './AllocationGraph'

type Props = {
  numbers: NumberEntry[]
  rules: RulesData
}

type View = 'tree' | 'graph'

function RecallTab({ numbers, rules }: Props) {
  const [view, setView] = useState<View>('tree')

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div class="recall-view-switch">
        <button
          class={'recall-view-btn' + (view === 'tree' ? ' active' : '')}
          onClick={() => setView('tree')}
        >
          ツリー
        </button>
        <button
          class={'recall-view-btn' + (view === 'graph' ? ' active' : '')}
          onClick={() => setView('graph')}
        >
          割り当てグラフ
        </button>
      </div>
      {view === 'tree' ? (
        <RecallTreePanel numbers={numbers} rules={rules} />
      ) : (
        <AllocationGraph numbers={numbers} />
      )}
    </div>
  )
}

export default RecallTab
