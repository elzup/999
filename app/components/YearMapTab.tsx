import { h } from 'preact'
import { useState, useMemo, useCallback } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { buildYearMap, getMapBounds, type MapTile } from '../lib/yearMap'
import {
  candidatesOf,
  loadYmapChoices,
  saveYmapChoices,
  exportYmapChoices,
  type Slot,
} from '../lib/choice'
import NumDetailPanel from './NumDetailPanel'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

const GROUP_LABEL: Record<string, string> = {
  up: 'up',
  down: 'down',
}

function MapTileView({
  tile,
  selected,
  onSelect,
}: {
  tile: MapTile
  selected: boolean
  onSelect: () => void
}) {
  return (
    <button
      class={'ymap-tile' + (selected ? ' sel' : '')}
      title={`${tile.xy} → ${tile.num}${tile.word ? ' ' + tile.word : ''}`}
      onClick={onSelect}
    >
      {tile.img ? (
        <img class="ymap-tile-img" loading="lazy" src={tile.img} alt="" />
      ) : (
        <span class="ymap-tile-noimg" />
      )}
      <span class="ymap-tile-num">{tile.xy}</span>
    </button>
  )
}

/** 採用候補を選ぶピッカー (語句が2つ以上ある番号のみ意味を持つ) */
function CandidatePicker({
  entry,
  current,
  onPick,
}: {
  entry: NumberEntry
  current: Slot | null
  onPick: (slot: Slot) => void
}) {
  const cands = candidatesOf(entry)
  if (cands.length <= 1) return null
  return (
    <div class="ymap-pick">
      <span class="ymap-pick-label">年マップ採用</span>
      {cands.map((c) => (
        <button
          key={c.slot}
          class={'ymap-pick-btn' + (c.slot === current ? ' active' : '')}
          onClick={() => onPick(c.slot)}
        >
          {c.img ? <img src={c.img} alt="" loading="lazy" /> : null}
          <span>{c.word}</span>
        </button>
      ))}
    </div>
  )
}

function YearMapTab({ numbers, bookmarks, onToggleBm }: Props) {
  const [sel, setSel] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<string, Slot>>(loadYmapChoices)
  const [copied, setCopied] = useState(false)

  const cells = useMemo(
    () => buildYearMap(numbers, choices),
    [numbers, choices]
  )
  const bounds = useMemo(() => getMapBounds(), [])

  const selEntry = useMemo(
    () => (sel ? (numbers.find((n) => n.num === sel) ?? null) : null),
    [sel, numbers]
  )
  const selSlot = useMemo(
    () =>
      sel
        ? (cells.flatMap((c) => c.tiles).find((t) => t.num === sel)?.slot ??
          null)
        : null,
    [sel, cells]
  )

  const pick = useCallback((num: string, slot: Slot) => {
    setChoices((prev) => {
      const next = { ...prev, [num]: slot }
      saveYmapChoices(next)
      return next
    })
  }, [])

  const exportChoices = useCallback(() => {
    const text = exportYmapChoices(choices)
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true)
        window.setTimeout(() => setCopied(false), 1500)
      },
      () => {}
    )
  }, [choices])

  const pickCount = Object.keys(choices).length

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
      }}
    >
      <div class="sticky-wrap">
        {selEntry ? (
          <>
            <CandidatePicker
              entry={selEntry}
              current={selSlot}
              onPick={(slot) => pick(selEntry.num, slot)}
            />
            <NumDetailPanel
              d={selEntry}
              bookmarks={bookmarks}
              onToggleBm={onToggleBm}
            />
            <div style={{ padding: '0 12px 8px' }}>
              <button
                class="d2-mode-btn"
                style={{ padding: '4px 10px', width: '100%' }}
                onClick={() => setSel(null)}
              >
                閉じる
              </button>
            </div>
          </>
        ) : (
          <div class="ymap-toolbar">
            <span class="sticky-empty" style={{ flex: 1 }}>
              2桁数字をタップで詳細・候補切替
            </span>
            <button
              class="filter-btn"
              style={{ fontSize: '11px', padding: '4px 8px' }}
              onClick={exportChoices}
              disabled={pickCount === 0}
            >
              {copied ? 'コピー済' : `選択をエクスポート (${pickCount})`}
            </button>
          </div>
        )}
      </div>
      <div class="content ymap-scroll">
        <div
          class="ymap-grid"
          style={{
            gridTemplateColumns: `repeat(${bounds.cols}, 1fr)`,
            gridTemplateRows: `repeat(${bounds.rows}, 1fr)`,
            aspectRatio: `${bounds.cols} / ${bounds.rows}`,
          }}
        >
          {cells.map((cell, i) => (
            <div
              key={i}
              class={'ymap-cell' + (cell.tiles.length === 0 ? ' empty' : '')}
              style={{
                gridColumn: `${cell.x - bounds.minX + 1} / span ${cell.w}`,
                gridRow: `${cell.y - bounds.minY + 1} / span ${cell.h}`,
                '--ymap-c': cell.color,
                '--ymap-w': String(cell.w),
              }}
            >
              <span class="ymap-cell-label">
                {GROUP_LABEL[cell.group] ?? cell.group}
              </span>
              <div class="ymap-tiles">
                {cell.tiles.map((tile) => (
                  <MapTileView
                    key={tile.xy}
                    tile={tile}
                    selected={sel === tile.num}
                    onSelect={() => setSel(tile.num)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default YearMapTab
