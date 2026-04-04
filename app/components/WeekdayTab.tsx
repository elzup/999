import { h } from 'preact'
import { useCallback, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import D3Tab from './D3Tab'
import WeekdayCalcTab from './WeekdayCalcTab'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
  onCheckingChange?: (checking: boolean) => void
}

type SubTab = 'code' | 'calc'

function WeekdayTab({ numbers, bookmarks, onToggleBm, onCheckingChange }: Props) {
  const [sub, setSub] = useState<SubTab>('code')

  const handleSub = useCallback((next: SubTab) => {
    setSub(next)
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
          class={'sub-tab-btn' + (sub === 'code' ? ' active' : '')}
          onClick={() => handleSub('code')}
        >
          年コード
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'calc' ? ' active' : '')}
          onClick={() => handleSub('calc')}
        >
          曜日計算
        </button>
      </div>
      {sub === 'code' ? (
        <D3Tab
          numbers={numbers}
          bookmarks={bookmarks}
          onToggleBm={onToggleBm}
          onCheckingChange={onCheckingChange}
        />
      ) : (
        <WeekdayCalcTab />
      )}
    </div>
  )
}

export default WeekdayTab
