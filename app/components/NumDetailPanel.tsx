import type { NumberEntry } from '../data/schema'
import ScoreBar from './ScoreBar'
import { parseTaggedItems } from '../lib/tags'

type Props = {
  d: NumberEntry
  bookmarks?: Set<string>
  onToggleBm?: (key: string) => void
  onClose?: () => void
}

function NumDetailPanel({ d, bookmarks, onToggleBm, onClose }: Props) {
  const bmKey = 'n:' + d.num
  const isBm = bookmarks ? bookmarks.has(bmKey) : false
  const tagged = [
    ['人', parseTaggedItems(d.hito)],
    ['物', parseTaggedItems(d.mono)],
    ['念', parseTaggedItems(d.gainen)],
  ] as const

  return (
    <div class="detail-panel">
      <div class="detail-row1">
        <span class="detail-id">{d.num}</span>
        {d.wh1Img || d.w1Img ? (
          <img
            class="detail-word-img"
            loading="lazy"
            src={d.wh1Img || d.w1Img}
            alt={d.wh1 || d.w1}
          />
        ) : null}
        {d.wh1 || d.w1 ? (
          <span class="detail-main-word">
            {d.wh1 || d.w1}
            {d.wh1k || d.w1k ? (
              <span class="detail-sub-word"> {d.wh1k || d.w1k}</span>
            ) : null}
          </span>
        ) : null}
        {d.w1Score != null ? (
          <ScoreBar
            label={'WH1' + (d.w1Pattern ? ' [' + d.w1Pattern + ']' : '')}
            score={d.w1Score}
            error={d.w1Error}
          />
        ) : null}
        {d.wm1Img || d.w2Img ? (
          <img
            class="detail-word-img"
            loading="lazy"
            src={d.wm1Img || d.w2Img}
            alt={d.wm1 || d.w2}
          />
        ) : null}
        {d.wm1 || d.w2 ? (
          <span class="detail-main-word" style={{ color: 'var(--text2)' }}>
            {d.wm1 || d.w2}
            {d.wm1k || d.w2k ? (
              <span class="detail-sub-word"> {d.wm1k || d.w2k}</span>
            ) : null}
          </span>
        ) : null}
        {d.w2Score != null ? (
          <ScoreBar label="WM1" score={d.w2Score} error={d.w2Error} />
        ) : null}
        {/* 2枠目の穴埋め: mono が空なら人の2人目、hito が空なら mono の2つ目 */}
        {!(d.wm1 || d.w2) && (d.wh2Img || d.w1_2Img) ? (
          <img
            class="detail-word-img"
            loading="lazy"
            src={d.wh2Img || d.w1_2Img}
            alt={d.wh2 || d.w1_2}
          />
        ) : null}
        {!(d.wm1 || d.w2) && (d.wh2 || d.w1_2) ? (
          <span class="detail-main-word" style={{ color: 'var(--text2)' }}>
            {d.wh2 || d.w1_2}
          </span>
        ) : null}
        {!(d.wh1 || d.w1) && (d.wm2Img || d.w2_2Img) ? (
          <img
            class="detail-word-img"
            loading="lazy"
            src={d.wm2Img || d.w2_2Img}
            alt={d.wm2 || d.w2_2}
          />
        ) : null}
        {!(d.wh1 || d.w1) && (d.wm2 || d.w2_2) ? (
          <span class="detail-main-word" style={{ color: 'var(--text2)' }}>
            {d.wm2 || d.w2_2}
          </span>
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
      <div class="detail-body">
        <div class="detail-chip">
          <span class="dc-label">wh1</span>
          <span class="dc-val">{d.wh1 || d.w1 || '-'}</span>
        </div>
        <div class="detail-chip">
          <span class="dc-label">wh2</span>
          <span class="dc-val">{d.wh2 || d.w1_2 || '-'}</span>
        </div>
        <div class="detail-chip">
          <span class="dc-label">wm1</span>
          <span class="dc-val">{d.wm1 || d.w2 || '-'}</span>
        </div>
        <div class="detail-chip">
          <span class="dc-label">wm2</span>
          <span class="dc-val">{d.wm2 || d.w2_2 || '-'}</span>
        </div>
      </div>
      {tagged.some(([, items]) =>
        items.some((item) => item.tags.length > 0)
      ) ? (
        <div class="detail-tag-row">
          {tagged.map(([label, items]) =>
            items
              .filter((item) => item.tags.length > 0)
              .map((item) => (
                <div key={`${label}-${item.label}`} class="detail-tag-chip">
                  <span class="detail-tag-cat">{label}</span>
                  <span class="detail-tag-name">{item.base || item.label}</span>
                  <span class="detail-tag-tags">
                    {item.tags.map((tag) => `#${tag}`).join(' ')}
                  </span>
                </div>
              ))
          )}
        </div>
      ) : null}
    </div>
  )
}

export default NumDetailPanel
