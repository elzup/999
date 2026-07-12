import { h } from 'preact'
import { useState, useCallback } from 'preact/hooks'
import type { NumberEntry, RulesData } from '../data/schema'
import StorageEstimatePanel from './StorageEstimatePanel'
import TagPanel from './TagPanel'
import RulesPanel from './RulesPanel'
import RecallTab from './RecallTab'
import ActivatePanel from './ActivatePanel'
import { SHEET_EDIT_URL } from '../data/constants'

type Props = {
  numbers: NumberEntry[]
  rules?: RulesData
}

type SubTab =
  | 'sheet'
  | 'tags'
  | 'rules'
  | 'recall'
  | 'stats'
  | 'storage'
  | 'activate'

function MiscTab({ numbers, rules }: Props) {
  const [sub, setSub] = useState<SubTab>('sheet')

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
          class={'sub-tab-btn' + (sub === 'sheet' ? ' active' : '')}
          onClick={() => handleSub('sheet')}
        >
          編集
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'tags' ? ' active' : '')}
          onClick={() => handleSub('tags')}
        >
          タグ
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
          class={'sub-tab-btn' + (sub === 'storage' ? ' active' : '')}
          onClick={() => handleSub('storage')}
        >
          容量
        </button>
        <button
          class={'sub-tab-btn' + (sub === 'activate' ? ' active' : '')}
          onClick={() => handleSub('activate')}
        >
          認証
        </button>
      </div>
      {sub === 'sheet' && (
        <div class="content activate-panel">
          <p class="activate-desc">
            辞書の追加・編集・タグ付けは当面 Google スプレッドシートで行います。
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
      )}
      {sub === 'tags' && <TagPanel numbers={numbers} />}
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
      {sub === 'storage' && <StorageEstimatePanel />}
      {sub === 'activate' && <ActivatePanel />}
    </div>
  )
}

export default MiscTab
