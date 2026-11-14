// 番号 > グループ: 番号を «まとまり» で見る面。タグ別と 2桁 (上2桁・下2桁) を切り替える
import { h } from 'preact'
import type { NumberEntry } from '../data/schema'
import DigitTab from './DigitTab'
import TagFilterTab from './TagFilterTab'
import SubTabGroup from './SubTabGroup'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

function NumGroupingTab({ numbers, bookmarks, onToggleBm }: Props) {
  return (
    <SubTabGroup<'tag' | 'd2'>
      storageKey="subtab.num.group"
      tabs={[
        {
          id: 'tag',
          label: 'タグ',
          render: () => <TagFilterTab numbers={numbers} />,
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
      ]}
    />
  )
}

export default NumGroupingTab
