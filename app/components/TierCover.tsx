// ティアカバー: 番号の読みの格子に、登録語が通る経路を引く小さな図 (詳細パネル用、D-0096 / D-0097)。
// 経路は通るマスの中心を結ぶ折れ線。同じマスを通る語は上下に少しずらして並走させる (B-2)。
import { useMemo } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { useReadingTables } from '../lib/reading'
import {
  buildTierCover,
  DIGIT_COUNT,
  type CoverCell,
  type CoverNode,
  type CoverRow,
  type CoverWord,
} from '../lib/tierCover'

// 詳細パネルの語の行 (34px の画像) より小さく収める。かなは 2 文字 (てぃ) まで読める幅
const CELL_W = 26
const CELL_H = 18
const GAP = 3
const LABEL_W = 26
const HEAD_H = 12
// 余りの列は桁の列と区別するため少し離す
const REST_GAP = 8
const ARROW_W = 10
// 並走させる線の間隔。線の太さ (2px) より少し広く
const LANE_PX = 2.5

const ROW_LABEL: Record<CoverRow, string> = {
  d0: '2桁',
  d1: '2桁',
  core: 'core',
  sub: 'sub',
  bad: 'bad',
}

type Point = { x: number; y: number }

function geometry(rows: CoverRow[]) {
  const colX = (col: number) => LABEL_W + col * (CELL_W + GAP)
  const restX = colX(DIGIT_COUNT) + REST_GAP - GAP
  const rowY = (row: CoverRow) => HEAD_H + rows.indexOf(row) * (CELL_H + GAP)
  const width = restX + CELL_W + ARROW_W
  const height = HEAD_H + rows.length * (CELL_H + GAP)
  const cellBox = (cell: { row: CoverRow; col: number; span: number }) => ({
    x: colX(cell.col),
    y: rowY(cell.row),
    w: cell.span * CELL_W + (cell.span - 1) * GAP,
  })
  const center = (node: CoverNode, span: number): Point => {
    const b = cellBox({ ...node, span })
    return { x: b.x + b.w / 2, y: b.y + CELL_H / 2 }
  }
  return { colX, restX, rowY, width, height, cellBox, center }
}

const spanOf = (row: CoverRow) => (row === 'd0' || row === 'd1' ? 2 : 1)
const nodeKey = (n: CoverNode) => `${n.row}:${n.col}`

/** 余りは語ごとに、その語の最後のマスと同じ行に置く。同じ行に別の余りがあれば ・ でつなぐ */
function restCells(words: CoverWord[]) {
  const byRow = new Map<CoverRow, string[]>()
  for (const w of words) {
    if (!w.rest) continue
    const row = w.nodes[w.nodes.length - 1].row
    const list = byRow.get(row) ?? []
    if (!list.includes(w.rest)) byRow.set(row, [...list, w.rest])
  }
  return [...byRow].map(([row, rests]) => ({ row, kana: rests.join('・') }))
}

type Props = { d: NumberEntry }

function TierCover({ d }: Props) {
  const tables = useReadingTables()
  const cover = useMemo(
    () => (tables ? buildTierCover(tables, d) : null),
    [tables, d]
  )
  if (!cover || cover.words.length === 0) return null
  const g = geometry(cover.rows)
  const used = new Set(cover.words.flatMap((w) => w.nodes.map(nodeKey)))
  const rests = restCells(cover.words)
  const lane = (i: number) => (i - (cover.words.length - 1) / 2) * LANE_PX

  const cell = (c: CoverCell) => {
    const b = g.cellBox(c)
    const isOn = used.has(nodeKey(c))
    return (
      <g
        key={nodeKey(c)}
        class={'tc-cell' + (isOn ? ' on' : '') + (c.kana ? '' : ' none')}
      >
        <rect x={b.x} y={b.y} width={b.w} height={CELL_H} rx={4} />
      </g>
    )
  }

  const path = (w: CoverWord, i: number) => {
    const dy = lane(i)
    const pts = w.nodes.map((n) => {
      const p = g.center(n, spanOf(n.row))
      return { x: p.x, y: p.y + dy }
    })
    if (w.rest) {
      const last = pts[pts.length - 1]
      pts.push({ x: g.restX + CELL_W + ARROW_W - 2, y: last.y })
    }
    const d = pts.map((p, k) => `${k ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')
    return (
      <g key={w.slot} class={'tc-path kind-' + w.kind}>
        <path d={d} />
        {w.nodes.length === 1 && !w.rest ? (
          <circle cx={pts[0].x} cy={pts[0].y} r={2.5} />
        ) : null}
      </g>
    )
  }

  return (
    <figure
      class="tier-cover"
      aria-label={`${cover.num} の読みを登録語がどれだけ通っているか`}
    >
      <svg
        width={g.width}
        height={g.height}
        viewBox={`0 0 ${g.width} ${g.height}`}
        role="img"
      >
        {[...cover.num].map((digit, col) => (
          <text key={col} class="tc-head" x={g.colX(col) + CELL_W / 2} y={9}>
            {digit}
          </text>
        ))}
        <text class="tc-head" x={g.restX + CELL_W / 2} y={9}>
          余り
        </text>
        {cover.rows.map((row) => (
          <text
            key={row}
            class="tc-label"
            x={LABEL_W - 4}
            y={g.rowY(row) + CELL_H / 2 + 3}
          >
            {ROW_LABEL[row]}
          </text>
        ))}
        <line
          class="tc-divider"
          x1={g.restX - REST_GAP / 2}
          x2={g.restX - REST_GAP / 2}
          y1={HEAD_H - 2}
          y2={g.height - GAP}
        />
        {cover.cells.map(cell)}
        {rests.map((r) => (
          <g key={'rest:' + r.row} class="tc-cell on rest">
            <rect
              x={g.restX}
              y={g.rowY(r.row)}
              width={CELL_W}
              height={CELL_H}
              rx={4}
            />
          </g>
        ))}
        {cover.words.map(path)}
        {/* かなは線の上に出す (線が文字を潰さないように) */}
        {cover.cells.map((c) => {
          const b = g.cellBox(c)
          return (
            <text
              key={'t:' + nodeKey(c)}
              class={'tc-kana' + (used.has(nodeKey(c)) ? ' on' : '')}
              x={b.x + b.w / 2}
              y={b.y + CELL_H / 2 + 4}
            >
              {c.kana || '—'}
            </text>
          )
        })}
        {rests.map((r) => (
          <text
            key={'rt:' + r.row}
            class="tc-kana on"
            x={g.restX + CELL_W / 2}
            y={g.rowY(r.row) + CELL_H / 2 + 4}
          >
            {r.kana}
          </text>
        ))}
      </svg>
    </figure>
  )
}

export default TierCover
