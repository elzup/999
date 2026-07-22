import { h } from 'preact'
import { useState, useMemo, useCallback } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { NumberEntry } from '../data/schema'
import {
  buildUnits,
  type MapUnit,
  type MapTile,
  type RenderedCell,
} from '../lib/yearMap'
import {
  candidatesOf,
  loadYmapChoices,
  saveYmapChoices,
  exportYmapChoices,
  type Slot,
} from '../lib/choice'
import NumDetailPanel from './NumDetailPanel'

export type MapBounds = {
  minX: number
  minY: number
  cols: number
  rows: number
}
export type BuildResult = { cells: RenderedCell[]; bounds: MapBounds }

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
  /** choices を受けて cells/bounds を組み立てる (choices 変更で再構築) */
  build: (choices: Record<string, Slot>) => BuildResult
  hint?: string
  /** 上部に差し込む追加コントロール (マップ切替など) */
  controls?: ComponentChildren
}

const GROUP_LABEL: Record<string, string> = { up: 'up', down: 'down' }

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
      <span class="ymap-pick-label">採用</span>
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

function MapView({
  numbers,
  bookmarks,
  onToggleBm,
  build,
  hint,
  controls,
}: Props) {
  const [sel, setSel] = useState<string | null>(null)
  const [choices, setChoices] = useState<Record<string, Slot>>(loadYmapChoices)
  const [copied, setCopied] = useState(false)

  const { cells, bounds } = useMemo(() => build(choices), [build, choices])

  const units = useMemo(() => buildUnits(cells), [cells])

  const selEntry = useMemo(
    () => (sel ? numbers.find((n) => n.num === sel) ?? null : null),
    [sel, numbers]
  )
  const selSlot = useMemo(
    () =>
      sel
        ? cells.flatMap((c) => c.tiles).find((t) => t.num === sel)?.slot ?? null
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
      {controls}
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
              {hint ?? '数字をタップで詳細・候補切替'}
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
          {units.map((unit: MapUnit) => (
            <div
              key={unit.key}
              class={'ymap-unit' + (unit.tile ? '' : ' empty')}
              style={{
                gridColumn: `${unit.gx - bounds.minX + 1} / span 1`,
                gridRow: `${unit.gy - bounds.minY + 1} / span 1`,
                '--ymap-c': unit.color,
                borderTopWidth: unit.borders.top ? '2.5px' : '0',
                borderRightWidth: unit.borders.right ? '2.5px' : '0',
                borderBottomWidth: unit.borders.bottom ? '2.5px' : '0',
                borderLeftWidth: unit.borders.left ? '2.5px' : '0',
              }}
            >
              {unit.tile ? (
                <MapTileView
                  tile={unit.tile}
                  selected={sel === unit.tile.num}
                  onSelect={() => setSel(unit.tile?.num ?? null)}
                />
              ) : null}
            </div>
          ))}
          {cells.map((cell, i) => (
            <div
              key={`label-${i}`}
              class="ymap-cell-label-wrap"
              style={{
                gridColumn: `${cell.x - bounds.minX + 1} / span ${cell.w}`,
                gridRow: `${cell.y - bounds.minY + 1} / span ${cell.h}`,
              }}
            >
              <span class="ymap-cell-label">
                {GROUP_LABEL[cell.group] ?? cell.group}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

export default MapView
