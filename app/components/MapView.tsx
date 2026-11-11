import { h } from 'preact'
import { useMemo } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import type { NumberEntry } from '../data/schema'
import {
  buildUnits,
  type MapUnit,
  type MapTile,
  type RenderedCell,
} from '../lib/yearMap'
import type { Slot } from '../lib/choice'
import { useRepSlots } from '../lib/useRepSlots'
import { REP_STATUS_LABEL, type RepStatus } from '../lib/numberDetail'
import NumDetailPanel from './NumDetailPanel'
import Screen, { DockRow } from './Screen'
import { useSelection } from '../lib/useSelection'
import DetailSheet from './DetailSheet'

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
  /** 代表① (num → スロット) を受けて cells/bounds を組み立てる (代表が読めたら再構築) */
  build: (repSlots: Record<string, Slot>) => BuildResult
  /** 代表①を読む百の位 (年マップは 0) */
  hundred: number
  hint?: string
  /** dock の最下段 (サブタブの直上) に差し込む追加コントロール (マップ切替など) */
  controls?: ComponentChildren
  /** 詳細の «編集»。省略時は NumberContext (今のタブに重ねて開く) */
  onEditWord?: (num: string) => void
}

const GROUP_LABEL: Record<string, string> = { up: 'up', down: 'down' }

function MapTileView({
  tile,
  selected,
  onSelect,
  rep,
}: {
  tile: MapTile
  selected: boolean
  onSelect: () => void
  /** 代表の確定状態。確定していないタイルだけ右上に印を付ける */
  rep?: RepStatus
}) {
  return (
    <button
      class={'ymap-tile' + (selected ? ' sel' : '')}
      title={`${tile.xy} → ${tile.num}${tile.word ? ' ' + tile.word : ''}${
        rep && rep !== 'confirmed' ? ' (' + REP_STATUS_LABEL[rep] + ')' : ''
      }`}
      onClick={onSelect}
    >
      {rep && rep !== 'confirmed' ? (
        <span class={'ymap-tile-rep ' + rep} aria-hidden="true" />
      ) : null}
      {tile.img ? (
        <img class="ymap-tile-img" loading="lazy" src={tile.img} alt="" />
      ) : (
        <span class="ymap-tile-noimg" />
      )}
      <span class="ymap-tile-num">{tile.xy}</span>
    </button>
  )
}

function MapView({
  numbers,
  bookmarks,
  onToggleBm,
  build,
  hint,
  controls,
  onEditWord,
  hundred,
}: Props) {
  const {
    slots: repSlots,
    status: repStatusOf,
    state: repState,
  } = useRepSlots(hundred, numbers)
  const { cells, bounds } = useMemo(() => build(repSlots), [build, repSlots])

  const units = useMemo(() => buildUnits(cells), [cells])

  // 前へ / 次へ は番号順 (マップ上の位置はばらばらなので、番号で隣へ送る)
  const order = useMemo(
    () =>
      cells
        .flatMap((c) => c.tiles)
        .map((t) => t.num)
        .sort(),
    [cells]
  )
  const { selected: sel, toggle, clear, nav } = useSelection(order)

  const selEntry = useMemo(
    () => (sel ? (numbers.find((n) => n.num === sel) ?? null) : null),
    [sel, numbers]
  )

  // 詳細は «全体» と同じ枠とカード。タイルの絵は代表①なので、変えたいときは «編集» で
  const panel = selEntry ? (
    <DetailSheet nav={nav} onClose={clear}>
      <NumDetailPanel
        d={selEntry}
        bookmarks={bookmarks}
        onToggleBm={onToggleBm}
        onEdit={onEditWord ? () => onEditWord(selEntry.num) : undefined}
      />
    </DetailSheet>
  ) : null

  const repNote =
    repState === 'loading'
      ? '代表を読み込み中…'
      : repState === 'error'
        ? '代表を読めないので人の 1 番手で表示中'
        : null

  // 代表が確定していない番号の数 (タイル右上の印と同じ)
  const unconfirmed = order.filter(
    (num) => repStatusOf[num] && repStatusOf[num] !== 'confirmed'
  ).length

  const dock = (
    <>
      {selEntry ? null : (
        <DockRow>
          <span class="dock-row-label ymap-hint">
            {repNote ?? hint ?? '数字をタップで詳細 ・ 絵は代表①'}
          </span>
          {repState === 'ready' ? (
            <span class="ymap-rep-count">
              {unconfirmed > 0 ? (
                <>
                  <span class="ymap-rep-dot" /> 未確定 {unconfirmed}
                </>
              ) : (
                '代表すべて確定'
              )}
            </span>
          ) : null}
        </DockRow>
      )}
      {controls}
    </>
  )

  // 2 次元のマップなので下から上へは並べ替えない (位置そのものが意味を持つ)
  const main = (
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
              onSelect={() => unit.tile && toggle(unit.tile.num)}
              rep={repStatusOf[unit.tile.num]}
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
  )

  return <Screen main={main} panel={panel} dock={dock} />
}

export default MapView
