import { h } from 'preact'
import { useState, useCallback } from 'preact/hooks'
import type { NumberEntry, RulesData } from '../data/schema'
import type { TabVisibility } from '../data/storage'
import StorageEstimatePanel from './StorageEstimatePanel'
import TagPanel from './TagPanel'
import HitoMonoPanel from './HitoMonoPanel'
import RulesPanel from './RulesPanel'
import RecallTab from './RecallTab'
import ActivatePanel from './ActivatePanel'
import TabVisibilityPanel from './TabVisibilityPanel'
import { SHEET_EDIT_URL } from '../data/constants'
import type { TabId } from '../data/constants'

type Props = {
  numbers: NumberEntry[]
  rules?: RulesData
  visibility: TabVisibility
  onVisibilityChange: (next: TabVisibility) => void
  onSelectTab: (id: TabId) => void
}

type SubTab = 'tags' | 'hm' | 'rules' | 'recall' | 'stats' | 'tabs'

function MiscTab({
  numbers,
  rules,
  visibility,
  onVisibilityChange,
  onSelectTab,
}: Props) {
  const [sub, setSub] = useState<SubTab>('tabs')

  const handleSub = useCallback((s: SubTab) => {
    setSub(s)
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
          class={'sub-tab-btn' + (sub === 'tags' ? ' active' : '')}
          onClick={() => handleSub('tags')}
        >
          タグ
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'hm' ? ' active' : '')}
          onClick={() => handleSub('hm')}
        >
          人モノ
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'rules' ? ' active' : '')}
          onClick={() => handleSub('rules')}
        >
          ルール
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'recall' ? ' active' : '')}
          onClick={() => handleSub('recall')}
        >
          想起
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'stats' ? ' active' : '')}
          onClick={() => handleSub('stats')}
        >
          統計
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'tabs' ? ' active' : '')}
          onClick={() => handleSub('tabs')}
        >
          タブ
        </button>
      </div>
      {sub === 'tags' && <TagPanel numbers={numbers} />}
      {sub === 'hm' && <HitoMonoPanel numbers={numbers} />}
      {sub === 'rules' &&
        (rules ? (
          <RulesPanel rules={rules} />
        ) : (
          <div class="content" style={{ padding: 16, color: 'var(--text2)' }}>
            ルールデータが見つかりません
          </div>
        ))}
      {sub === 'recall' &&
        (rules ? (
          <RecallTab numbers={numbers} rules={rules} />
        ) : (
          <div class="content" style={{ padding: 16, color: 'var(--text2)' }}>
            ルールデータが見つかりません
          </div>
        ))}
      {sub === 'stats' && <iframe class="stats-frame" src="./stats.html" />}
      {sub === 'tabs' && (
        <div class="content settings-top">
          <TabVisibilityPanel
            visibility={visibility}
            onChange={onVisibilityChange}
            onSelectTab={onSelectTab}
          />
          <ActivatePanel />
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
      )}
    </div>
  )
}

export default MiscTab
