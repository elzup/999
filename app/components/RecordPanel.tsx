import type { Record } from '../data/schema'

type Props = {
  title: string
  records: Record[]
  onDelete: (index: number) => void
  onClear: () => void
  onClose: () => void
}

function RecordPanel({ title, records, onDelete, onClear, onClose }: Props) {
  return (
    <div
      class="rec-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div class="rec-panel">
        <div class="rec-panel-header">
          <h3>
            {title} 記録 ({records.length}件)
          </h3>
          {records.length > 0 && (
            <button class="rec-btn danger" onClick={onClear}>
              全削除
            </button>
          )}
          <button class="rec-btn" onClick={onClose}>
            閉じる
          </button>
        </div>
        <RecordList records={records} onDelete={onDelete} />
      </div>
    </div>
  )
}

type RecordListProps = {
  records: Record[]
  onDelete: (index: number) => void
}

function RecordList({ records, onDelete }: RecordListProps) {
  if (records.length === 0) {
    return (
      <div class="rec-panel-list">
        <div
          style={{ textAlign: 'center', color: 'var(--text2)', padding: '20px 0' }}
        >
          記録なし
        </div>
      </div>
    )
  }

  return (
    <div class="rec-panel-list">
      {records.map((r, i) => (
        <div key={i} class="rec-row">
          <span class="rec-date">
            {r.date.slice(5, 16).replace('T', ' ')}
          </span>
          <span
            class="rec-score"
            style={{ color: i === 0 ? 'var(--accent)' : 'var(--text)' }}
          >
            {r.score}/{r.total}
          </span>
          <span class="rec-time">{r.time}秒</span>
          <button class="rec-del" onClick={() => onDelete(i)}>
            ×
          </button>
        </div>
      ))}
    </div>
  )
}

export default RecordPanel
