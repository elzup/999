import { h } from 'preact'
import type { NumberEntry, RulesData, YomiUse } from '../data/schema'
import NumberTab from './NumberTab'
import DigitTab from './DigitTab'
import NumMapTab from './NumMapTab'
import AssocTestTab from './AssocTestTab'
import YomiTab from './YomiTab'
import SubTabGroup from './SubTabGroup'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
  rules?: RulesData
  yomiUse?: YomiUse
  onEditWord?: (num: string, slot?: string) => void
}

type SubTab = 'all' | 'd2' | 'yomi' | 'map' | 'test'

function NumGroupTab({
  numbers,
  bookmarks,
  onToggleBm,
  rules,
  yomiUse,
  onEditWord,
}: Props) {
  return (
    <SubTabGroup<SubTab>
      storageKey="subtab.num"
      tabs={[
        {
          id: 'all',
          label: '全体',
          render: () => (
            <NumberTab
              numbers={numbers}
              bookmarks={bookmarks}
              onToggleBm={onToggleBm}
              onEditWord={onEditWord}
            />
          ),
        },
        {
          id: 'd2',
          label: '2桁',
          render: () => (
            <DigitTab
              numbers={numbers}
              bookmarks={bookmarks}
              onToggleBm={onToggleBm}
            />
          ),
        },
        {
          id: 'yomi',
          label: '読み',
          render: () => (
            <YomiTab numbers={numbers} rules={rules} yomiUse={yomiUse} />
          ),
        },
        {
          id: 'map',
          label: 'マップ',
          render: () => (
            <NumMapTab
              numbers={numbers}
              bookmarks={bookmarks}
              onToggleBm={onToggleBm}
            />
          ),
        },
        {
          id: 'test',
          label: 'テスト',
          render: () => (
            <AssocTestTab
              numbers={numbers}
              bookmarks={bookmarks}
              onToggleBm={onToggleBm}
            />
          ),
        },
      ]}
    />
  )
}

export default NumGroupTab
