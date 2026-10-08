import { h } from 'preact'
import type { ComponentChildren } from 'preact'
import { useCallback, useState } from 'preact/hooks'
import { loadSubTab, saveSubTab } from '../data/storage'

export type SubTabDef<Id extends string> = {
  id: Id
  label: string
  render: () => ComponentChildren
}

type Props<Id extends string> = {
  // 選択中のサブタブを覚えておく localStorage キー ('subtab.card' など)。
  storageKey: string
  tabs: readonly SubTabDef<Id>[]
}

// グループ共通の下サブタブ (.sub-tab-switch)。選んだタブの中身だけを描画する。
// テスト中は各タブの .test-screen がこの切り替えごと覆うので、状態の引き回しは要らない。
function SubTabGroup<Id extends string>({ storageKey, tabs }: Props<Id>) {
  const [sub, setSub] = useState<Id>(() =>
    loadSubTab(
      storageKey,
      tabs.map((tab) => tab.id),
      tabs[0].id
    )
  )

  const handleSub = useCallback(
    (next: Id) => {
      saveSubTab(storageKey, next)
      setSub(next)
    },
    [storageKey]
  )

  const active = tabs.find((tab) => tab.id === sub) ?? tabs[0]

  return (
    <div class="sub-tab-group">
      <div class="sub-tab-switch">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            class={'sub-tab-btn' + (tab.id === active.id ? ' active' : '')}
            onClick={() => handleSub(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>
      {active.render()}
    </div>
  )
}

export default SubTabGroup
