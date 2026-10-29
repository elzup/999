import { h } from 'preact'
import type { NumberEntry, RulesData } from '../data/schema'
import type { TabVisibility } from '../data/storage'
import StorageEstimatePanel from './StorageEstimatePanel'
import TagPanel from './TagPanel'
import RulesPanel from './RulesPanel'
import RecallTab from './RecallTab'
import ActivatePanel from './ActivatePanel'
import SheetSyncPanel from './SheetSyncPanel'
import TabVisibilityPanel from './TabVisibilityPanel'
import SubTabGroup from './SubTabGroup'
import Screen from './Screen'
import { SHEET_EDIT_URL } from '../data/constants'
import type { TabId } from '../data/constants'

type Props = {
  numbers: NumberEntry[]
  rules?: RulesData
  visibility: TabVisibility
  onVisibilityChange: (next: TabVisibility) => void
  onSelectTab: (id: TabId) => void
}

type SubTab = 'tags' | 'rules' | 'recall' | 'stats' | 'tabs'

const SUB_KEY = 'subtab.misc'

function NoRules() {
  return (
    <Screen
      main={<div class="screen-empty">ルールデータが見つかりません</div>}
    />
  )
}

function MiscTab({
  numbers,
  rules,
  visibility,
  onVisibilityChange,
  onSelectTab,
}: Props) {
  // 一番使う «タブの表示» を下端 (親指側) に置き、上へ積む
  const settings = (
    <div class="settings-top stack-up" style={{ '--stack-gap': '8px' }}>
      <TabVisibilityPanel
        visibility={visibility}
        onChange={onVisibilityChange}
        onSelectTab={onSelectTab}
      />
      <ActivatePanel />
      <SheetSyncPanel />
      <div class="activate-panel">
        <div class="activate-status">外部リンク</div>
        <p class="activate-desc">
          辞書の追加・編集・タグ付けは Google スプレッドシートで行います。
        </p>
        <a
          class="activate-link"
          href={SHEET_EDIT_URL}
          target="_blank"
          rel="noreferrer"
        >
          スプレッドシートを開く
        </a>
      </div>
      <StorageEstimatePanel />
    </div>
  )

  return (
    <SubTabGroup<SubTab>
      storageKey={SUB_KEY}
      // 並び順は変えずに、初回だけ «タブ» を開く (以前の既定)
      defaultId="tabs"
      tabs={[
        {
          id: 'tags',
          label: 'タグ',
          render: () => <TagPanel numbers={numbers} />,
        },
        {
          id: 'rules',
          label: 'ルール',
          render: () => (rules ? <RulesPanel rules={rules} /> : <NoRules />),
        },
        {
          id: 'recall',
          label: '想起',
          render: () =>
            rules ? <RecallTab numbers={numbers} rules={rules} /> : <NoRules />,
        },
        {
          id: 'stats',
          label: '統計',
          // iframe は自前で高さいっぱいに伸びる。Screen の main に入れると高さが決まらない
          render: () => <iframe class="stats-frame" src="./stats.html" />,
        },
        {
          id: 'tabs',
          label: 'タブ',
          render: () => <Screen main={settings} />,
        },
      ]}
    />
  )
}

export default MiscTab
