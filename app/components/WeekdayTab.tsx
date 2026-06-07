import { h } from 'preact'
import { useCallback, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import D3Tab from './D3Tab'
import WeekdayCalcTab from './WeekdayCalcTab'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

type SubTab = 'code' | 'calc'

function WeekdayTab({ numbers, bookmarks, onToggleBm }: Props) {
  const [sub, setSub] = useState<SubTab>('code')

  const handleSub = useCallback((next: SubTab) => {
    setSub(next)
  }, [])

  // 年コードテスト中は D3Tab のテスト画面 (.test-screen) がこのサブタブ切り替えごと
  // 覆い隠すので、ここでは常に表示しておけばよい (状態の引き回し不要)。
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
        />
      ) : (
        <WeekdayCalcTab />
      )}
    </div>
  )
}

export default WeekdayTab
