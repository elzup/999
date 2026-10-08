import { h } from 'preact'
import type { ComponentChildren } from 'preact'
import type { SlideDeck } from '../lib/slideDeck'
import SlideLauncher from './SlideLauncher'
import SubTabGroup from './SubTabGroup'

type Props = {
  // 'subtab.<group>' の <group>。サブタブの選択状態の保存先になる。
  group: string
  mainLabel: string
  deck: SlideDeck
  bookmarks?: Set<string>
  onToggleBm?: (key: string) => void
  children: ComponentChildren
}

// サブタブを持たないグループに、下サブタブ「<本体> / テスト」を足す。
// 本体 (children) は元のタブをそのまま置き、テスト側にスライドの入口を出す。
function SlideTestGroup({
  group,
  mainLabel,
  deck,
  bookmarks,
  onToggleBm,
  children,
}: Props) {
  return (
    <SubTabGroup
      storageKey={`subtab.${group}`}
      tabs={[
        { id: 'main', label: mainLabel, render: () => children },
        {
          id: 'test',
          label: 'テスト',
          render: () => (
            <div class="content slide-test-home">
              <SlideLauncher
                deck={deck}
                bookmarks={bookmarks}
                onToggleBm={onToggleBm}
              />
            </div>
          ),
        },
      ]}
    />
  )
}

export default SlideTestGroup
