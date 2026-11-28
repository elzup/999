import { h } from 'preact'
import type { NumberEntry, RulesData, YomiUse } from '../data/schema'
import NumberTab from './NumberTab'
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

// グループ (d2) は Tab Bar の «タグ» に移した (QA-0116)
type SubTab = 'all' | 'yomi' | 'map' | 'test'

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
              onEditWord={onEditWord}
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
