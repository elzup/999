import { h } from 'preact'
import { useState, useCallback, useMemo } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import NumDetailPanel from './NumDetailPanel'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

function scoreColor(score: number | null): string | null {
  if (score === null || score === undefined) return null
  return score >= 35 ? '#4ade80' : score >= 25 ? '#fbbf24' : '#f87171'
}

type NumCellProps = {
  d: NumberEntry
  selected: boolean
  onSelect: () => void
}

function NumCell({ d, selected, onSelect }: NumCellProps) {
  const hasWord = d.w1 || d.w2
  const sc = d.w1Score != null ? d.w1Score : d.w2Score
  const color = scoreColor(sc)
  const borderStyle =
    color && !selected ? { borderColor: color + '66' } : {}

  return (
    <div
      class={
        'num-cell' +
        (selected ? ' selected' : '') +
        (!hasWord ? ' empty' : '')
      }
      style={borderStyle}
      onClick={onSelect}
    >
      <div class="num-id">{d.num}</div>
      {color ? (
        <div class="num-score-dot" style={{ background: color }} />
      ) : null}
    </div>
  )
}

type FilterMode = 'rows' | 'pads'
type DigitFilter = [string | null, string | null, string | null]

function DigitFilterRows({
  df,
  onTapDigit,
  onClearPos,
}: {
  df: DigitFilter
  onTapDigit: (pos: number, digit: string) => void
  onClearPos: (pos: number) => void
}) {
  return (
    <div class="df-rows">
      {[0, 1, 2].map((pos) => (
        <div key={pos} class="df-row">
          <span class="df-row-label">{pos + 1}</span>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
            <div
              key={digit}
              class={
                'df-key' + (df[pos] === String(digit) ? ' active' : '')
              }
              onClick={() => onTapDigit(pos, String(digit))}
            >
              {digit}
            </div>
          ))}
          <div
            class={'df-key' + (df[pos] === null ? ' active' : '')}
            style={{ fontSize: '12px' }}
            onClick={() => onClearPos(pos)}
          >
            *
          </div>
        </div>
      ))}
    </div>
  )
}

function DigitFilterPads({
  df,
  onTapDigit,
  onClearPos,
}: {
  df: DigitFilter
  onTapDigit: (pos: number, digit: string) => void
  onClearPos: (pos: number) => void
}) {
  return (
    <div class="df-pads">
      {[0, 1, 2].map((pos) => (
        <div key={pos} class="df-pad">
          <div class="df-pad-label">{pos + 1}桁目</div>
          <div class="df-pad-grid">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((digit) => (
              <div
                key={digit}
                class={
                  'df-pad-key' +
                  (df[pos] === String(digit) ? ' active' : '')
                }
                onClick={() => onTapDigit(pos, String(digit))}
              >
                {digit}
              </div>
            ))}
            <div
              class={
                'df-pad-key' + (df[pos] === null ? ' active' : '')
              }
              style={{ fontSize: '10px' }}
              onClick={() => onClearPos(pos)}
            >
              *
            </div>
            <div
              class={
                'df-pad-key zero' +
                (df[pos] === '0' ? ' active' : '')
              }
              onClick={() => onTapDigit(pos, '0')}
            >
              0
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

function NumberTab({ numbers, bookmarks, onToggleBm }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [df, setDf] = useState<DigitFilter>([null, null, null])
  const [showFilter, setShowFilter] = useState(false)
  const [filterMode, setFilterMode] = useState<FilterMode>('rows')

  const filtered = useMemo(() => {
    if (df[0] === null && df[1] === null && df[2] === null) return numbers
    return numbers.filter((d) => {
      if (df[0] !== null && d.num[0] !== df[0]) return false
      if (df[1] !== null && d.num[1] !== df[1]) return false
      if (df[2] !== null && d.num[2] !== df[2]) return false
      return true
    })
  }, [numbers, df])

  const selectedData = useMemo(() => {
    if (selected === null) return null
    return numbers.find((d) => d.num === selected) || null
  }, [numbers, selected])

  const tapDigitAt = useCallback((pos: number, digit: string) => {
    setDf((prev) => {
      const next = [...prev] as DigitFilter
      next[pos] = prev[pos] === digit ? null : digit
      return next
    })
    setSelected(null)
  }, [])

  const clearPosAt = useCallback((pos: number) => {
    setDf((prev) => {
      const n = [...prev] as DigitFilter
      n[pos] = null
      return n
    })
  }, [])

  const clearFilter = useCallback(() => {
    setDf([null, null, null])
    setSelected(null)
  }, [])

  const hasFilter = df[0] !== null || df[1] !== null || df[2] !== null
  const filterLabel = df.map((d) => (d === null ? '*' : d)).join('')

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
      <div class="sticky-wrap">
        {selectedData ? (
          <NumDetailPanel
            d={selectedData}
            bookmarks={bookmarks}
            onToggleBm={onToggleBm}
            onClose={() => setSelected(null)}
          />
        ) : (
          <div class="sticky-empty">
            <span>番号を選択</span>
            <button
              class="filter-btn"
              style={{ fontSize: '12px', padding: '4px 10px', marginLeft: '12px' }}
              onClick={() => setShowFilter(!showFilter)}
            >
              {showFilter ? '閉じる' : '検索'}
            </button>
            {hasFilter ? (
              <>
                <span
                  style={{
                    fontFamily: 'monospace',
                    fontSize: '16px',
                    fontWeight: 'bold',
                    color: 'var(--accent)',
                    marginLeft: '8px',
                  }}
                >
                  {filterLabel}
                </span>
                <span
                  style={{
                    fontSize: '12px',
                    color: 'var(--text2)',
                    marginLeft: '4px',
                  }}
                >
                  {filtered.length}件
                </span>
                <button
                  class="np-filter-clear"
                  style={{ marginLeft: '4px' }}
                  onClick={clearFilter}
                >
                  C
                </button>
              </>
            ) : null}
          </div>
        )}
      </div>
      <div class="content" style={{ flex: 1, paddingBottom: '4px' }}>
        <div class="num-grid">
          {filtered.map((d, i) => {
            const hundred = Math.floor(Number(d.num) / 100)
            const prevHundred =
              i > 0
                ? Math.floor(Number(filtered[i - 1].num) / 100)
                : -1
            const band =
              hundred !== prevHundred ? (
                <div class="num-band" key={'b' + hundred}>
                  {hundred}00–{hundred}99
                </div>
              ) : null
            return (
              <>
                {band}
                <NumCell
                  key={d.num}
                  d={d}
                  selected={selected === d.num}
                  onSelect={() =>
                    setSelected(selected === d.num ? null : d.num)
                  }
                />
              </>
            )
          })}
        </div>
      </div>
      {showFilter ? (
        <div class="np-filter-bar">
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: '4px',
            }}
          >
            <div style={{ display: 'flex', gap: '4px' }}>
              <button
                class={
                  'filter-btn' + (filterMode === 'rows' ? ' active' : '')
                }
                style={{ fontSize: '11px', padding: '3px 8px', minWidth: 0 }}
                onClick={() => setFilterMode('rows')}
              >
                3段
              </button>
              <button
                class={
                  'filter-btn' + (filterMode === 'pads' ? ' active' : '')
                }
                style={{ fontSize: '11px', padding: '3px 8px', minWidth: 0 }}
                onClick={() => setFilterMode('pads')}
              >
                テンキー
              </button>
            </div>
            {hasFilter ? (
              <button class="np-filter-clear" onClick={clearFilter}>
                C
              </button>
            ) : null}
          </div>
          {filterMode === 'rows' ? (
            <DigitFilterRows
              df={df}
              onTapDigit={tapDigitAt}
              onClearPos={clearPosAt}
            />
          ) : (
            <DigitFilterPads
              df={df}
              onTapDigit={tapDigitAt}
              onClearPos={clearPosAt}
            />
          )}
        </div>
      ) : null}
    </div>
  )
}

export default NumberTab
