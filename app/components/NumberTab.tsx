import { h } from 'preact'
import { useState, useCallback, useEffect, useMemo } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import NumDetailPanel from './NumDetailPanel'
import { NumCell } from './Cells'
import { useSelection } from '../lib/useSelection'
import Screen, { DockRow } from './Screen'
import DetailSheet from './DetailSheet'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
  /** 語をタップして編集へ (REQ-NDV-012) */
  onEditWord?: (num: string, slot?: string) => void
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
              class={'df-key' + (df[pos] === String(digit) ? ' active' : '')}
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
                  'df-pad-key' + (df[pos] === String(digit) ? ' active' : '')
                }
                onClick={() => onTapDigit(pos, String(digit))}
              >
                {digit}
              </div>
            ))}
            <div
              class={'df-pad-key' + (df[pos] === null ? ' active' : '')}
              style={{ fontSize: '10px' }}
              onClick={() => onClearPos(pos)}
            >
              *
            </div>
            <div
              class={'df-pad-key zero' + (df[pos] === '0' ? ' active' : '')}
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

// 語の編集へ入るとタブが «編集» に切り替わり、この画面は一度消える。
// 閉じて戻るたびに番号の絞り込みを打ち直さずに済むよう、アプリを開いている間だけ覚えておく
let remembered: {
  selected: string | null
  df: DigitFilter
  filterMode: FilterMode
} = { selected: null, df: [null, null, null], filterMode: 'rows' }

function NumberTab({ numbers, bookmarks, onToggleBm, onEditWord }: Props) {
  const [df, setDf] = useState<DigitFilter>(remembered.df)
  const [filterMode, setFilterMode] = useState<FilterMode>(
    remembered.filterMode
  )

  const filtered = useMemo(() => {
    if (df[0] === null && df[1] === null && df[2] === null) return numbers
    return numbers.filter((d) => {
      if (df[0] !== null && d.num[0] !== df[0]) return false
      if (df[1] !== null && d.num[1] !== df[1]) return false
      if (df[2] !== null && d.num[2] !== df[2]) return false
      return true
    })
  }, [numbers, df])

  // 前へ / 次へ は画面に出ている順 (絞り込み後) で送る
  const order = useMemo(() => filtered.map((d) => d.num), [filtered])
  const { selected, toggle, clear, nav } = useSelection(
    order,
    String,
    remembered.selected
  )

  useEffect(() => {
    remembered = { selected, df, filterMode }
  }, [selected, df, filterMode])

  const selectedData = useMemo(() => {
    if (selected === null) return null
    return numbers.find((d) => d.num === selected) || null
  }, [numbers, selected])

  const tapDigitAt = useCallback(
    (pos: number, digit: string) => {
      setDf((prev) => {
        const next = [...prev] as DigitFilter
        next[pos] = prev[pos] === digit ? null : digit
        return next
      })
      clear()
    },
    [clear]
  )

  const clearPosAt = useCallback((pos: number) => {
    setDf((prev) => {
      const n = [...prev] as DigitFilter
      n[pos] = null
      return n
    })
  }, [])

  const clearFilter = useCallback(() => {
    setDf([null, null, null])
    clear()
  }, [clear])

  const hasFilter = df[0] !== null || df[1] !== null || df[2] !== null
  const filterLabel = df.map((d) => (d === null ? '*' : d)).join('')

  const panel = selectedData ? (
    <DetailSheet nav={nav} onClose={clear}>
      <NumDetailPanel
        d={selectedData}
        bookmarks={bookmarks}
        onToggleBm={onToggleBm}
        onEdit={onEditWord ? () => onEditWord(selectedData.num) : undefined}
      />
    </DetailSheet>
  ) : null

  // 百の位の帯は各組の先頭 (= grid-up で組の下端) に入る
  const main = (
    <div class="num-grid grid-up">
      {filtered.map((d, i) => {
        const hundred = Math.floor(Number(d.num) / 100)
        const prevHundred =
          i > 0 ? Math.floor(Number(filtered[i - 1].num) / 100) : -1
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
              onSelect={() => toggle(d.num)}
            />
          </>
        )
      })}
    </div>
  )

  // フィルターは常時表示。開閉トグルを挟むと、絞り込み中かどうかが
  // 画面から消えて «なぜ件数が減っているのか» が分からなくなる
  const dock = (
    <>
      <DockRow>
        <button
          class={'filter-btn' + (filterMode === 'rows' ? ' active' : '')}
          onClick={() => setFilterMode('rows')}
        >
          3段
        </button>
        <button
          class={'filter-btn' + (filterMode === 'pads' ? ' active' : '')}
          onClick={() => setFilterMode('pads')}
        >
          テンキー
        </button>
        {hasFilter ? (
          <>
            <span class="dock-row-label">
              <span class="nt-filter-label">{filterLabel}</span>{' '}
              {filtered.length}件
            </span>
            <button class="np-filter-clear" onClick={clearFilter}>
              C
            </button>
          </>
        ) : (
          <span class="dock-row-label">番号を選択</span>
        )}
      </DockRow>
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
    </>
  )

  return <Screen main={main} panel={panel} dock={dock} />
}

export default NumberTab
