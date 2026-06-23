import { h } from 'preact'
import { useCallback, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import D3Tab from './D3Tab'
import WeekdayCalcTab from './WeekdayCalcTab'
import YearMapTab from './YearMapTab'
import { loadSubTab, saveSubTab } from '../data/storage'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

const SUB_TABS = ['code', 'map', 'calc'] as const
type SubTab = (typeof SUB_TABS)[number]
const SUB_TAB_KEY = 'subtab.weekday'

function WeekdayTab({ numbers, bookmarks, onToggleBm }: Props) {
  const [sub, setSub] = useState<SubTab>(() =>
    loadSubTab(SUB_TAB_KEY, SUB_TABS, 'code')
  )

  const handleSub = useCallback((next: SubTab) => {
    saveSubTab(SUB_TAB_KEY, next)
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
          class={'sub-tab-btn' + (sub === 'map' ? ' active' : '')}
          onClick={() => handleSub('map')}
        >
          年マップ
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'calc' ? ' active' : '')}
          onClick={() => handleSub('calc')}
        >
          曜日計算
        </button>
      </div>
      {sub === 'code' && (
        <D3Tab numbers={numbers} bookmarks={bookmarks} onToggleBm={onToggleBm} />
      )}
      {sub === 'map' && (
        <YearMapTab
          numbers={numbers}
          bookmarks={bookmarks}
          onToggleBm={onToggleBm}
        />
      )}
      {sub === 'calc' && <WeekdayCalcTab />}
    </div>
  )
}

export default WeekdayTab
