import { h } from 'preact'
import { useState, useCallback } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import NumberTab from './NumberTab'
import DigitTab from './DigitTab'
import D3Tab from './D3Tab'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

type SubTab = 'all' | 'd2' | 'd3'

function NumGroupTab({ numbers, bookmarks, onToggleBm }: Props) {
  const [sub, setSub] = useState<SubTab>('all')

  const handleSub = useCallback((s: SubTab) => {
    setSub(s)
  }, [])

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
      <div class="sub-tab-switch">
        <button
          class={'sub-tab-btn' + (sub === 'all' ? ' active' : '')}
          onClick={() => handleSub('all')}
        >
          全体
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'd2' ? ' active' : '')}
          onClick={() => handleSub('d2')}
        >
          2桁
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'd3' ? ' active' : '')}
          onClick={() => handleSub('d3')}
        >
          3桁
        </button>
      </div>
      {sub === 'all' && (
        <NumberTab numbers={numbers} bookmarks={bookmarks} onToggleBm={onToggleBm} />
      )}
      {sub === 'd2' && (
        <DigitTab numbers={numbers} bookmarks={bookmarks} onToggleBm={onToggleBm} />
      )}
      {sub === 'd3' && (
        <D3Tab numbers={numbers} bookmarks={bookmarks} onToggleBm={onToggleBm} />
      )}
    </div>
  )
}

export default NumGroupTab
