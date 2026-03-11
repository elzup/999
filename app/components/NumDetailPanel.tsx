import type { NumberEntry } from '../data/schema'
import ScoreBar from './ScoreBar'

type Props = {
  d: NumberEntry
  bookmarks?: Set<string>
  onToggleBm?: (key: string) => void
  onClose?: () => void
}

function NumDetailPanel({ d, bookmarks, onToggleBm, onClose }: Props) {
  const bmKey = 'n:' + d.num
  const isBm = bookmarks ? bookmarks.has(bmKey) : false

  return (
    <div class="detail-panel">
      <div class="detail-row1">
        <span class="detail-id">{d.num}</span>
        {d.w1 ? (
          <span class="detail-main-word">
            {d.w1}
            {d.w1k ? (
              <span class="detail-sub-word"> {d.w1k}</span>
            ) : null}
          </span>
        ) : null}
        {d.w1Score != null ? (
          <ScoreBar
            label={'W1' + (d.w1Pattern ? ' [' + d.w1Pattern + ']' : '')}
            score={d.w1Score}
            error={d.w1Error}
          />
        ) : null}
        {d.w2 ? (
          <span class="detail-main-word" style={{ color: 'var(--text2)' }}>
            {d.w2}
            {d.w2k ? (
              <span class="detail-sub-word"> {d.w2k}</span>
            ) : null}
          </span>
        ) : null}
        {d.w2Score != null ? (
          <ScoreBar label="W2" score={d.w2Score} error={d.w2Error} />
        ) : null}
        {d.catScore ? (
          <div class="detail-chip cat">
            <span class="dc-label">Cat</span>
            <span class="dc-val">{d.catScore}</span>
          </div>
        ) : null}
        <div class="detail-actions">
          {onToggleBm && (
            <span
              class={'bm-star ' + (isBm ? 'on' : '')}
              style={{ fontSize: '18px' }}
              onClick={() => onToggleBm(bmKey)}
            >
              {isBm ? '★' : '☆'}
            </span>
          )}
          {onClose && (
            <button
              class="d2-mode-btn"
              style={{ padding: '3px 8px', flex: 'none' }}
              onClick={onClose}
            >
              ×
            </button>
          )}
        </div>
      </div>
      <div class="detail-row2">
        {d.hito ? (
          <div class="detail-chip">
            <span class="dc-label">人</span>
            <span class="dc-val">{d.hito}</span>
          </div>
        ) : null}
        {d.mono ? (
          <div class="detail-chip">
            <span class="dc-label">物</span>
            <span class="dc-val">{d.mono}</span>
          </div>
        ) : null}
        {d.gainen ? (
          <div class="detail-chip">
            <span class="dc-label">念</span>
            <span class="dc-val">{d.gainen}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default NumDetailPanel
