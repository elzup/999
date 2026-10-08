import { h } from 'preact'
import type { NumberEntry } from '../data/schema'
import D3Tab from './D3Tab'
import WeekdayCalcTab from './WeekdayCalcTab'
import YearMapTab from './YearMapTab'
import SlideLauncher from './SlideLauncher'
import SubTabGroup from './SubTabGroup'
import { yearCodeDeck } from './slideDecks'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

// D3_LIST は定数なので、デッキは 1 度作れば足りる
const YEAR_CODE_DECK = yearCodeDeck()

function WeekdayTab({ numbers, bookmarks, onToggleBm }: Props) {
  return (
    <SubTabGroup
      storageKey="subtab.weekday"
      tabs={[
        {
          id: 'code',
          label: '年コード',
          render: () => (
            <D3Tab
              numbers={numbers}
              bookmarks={bookmarks}
              onToggleBm={onToggleBm}
            />
          ),
        },
        {
          id: 'map',
          label: '年マップ',
          render: () => (
            <YearMapTab
              numbers={numbers}
              bookmarks={bookmarks}
              onToggleBm={onToggleBm}
            />
          ),
        },
        { id: 'calc', label: '曜日計算', render: () => <WeekdayCalcTab /> },
        {
          id: 'test',
          label: 'テスト',
          render: () => (
            <div class="content slide-test-home">
              <SlideLauncher deck={YEAR_CODE_DECK} />
            </div>
          ),
        },
      ]}
    />
  )
}

export default WeekdayTab
