// ティアカバー: 番号の読みの格子に、登録語が通る経路を引く図 (詳細パネル用、D-0096〜D-0099)。
// 経路は通るマスの中心を結ぶ折れ線。同じマスを通る語は上下に少しずらして並走させる (B-2)。
// カードにはかな無しのミニ表示を ★ / 編集 の横に置き、長押ししている間だけ上に通常サイズを出す。
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { createPortal } from 'preact/compat'
import type { NumberEntry } from '../data/schema'
import { useReadingTables } from '../lib/reading'
import {
  buildTierCover,
  DIGIT_COUNT,
  type CoverNode,
  type CoverRow,
  type CoverWord,
  type TierCover as Cover,
} from '../lib/tierCover'

type Size = {
  cellW: number
  cellH: number
  gap: number
  labelW: number
  headH: number
  restGap: number
  arrowW: number
  lane: number
  stroke: number
  /** かな・見出しを描くか */
  hasText: boolean
}

// 通常: かなは 2 文字 (てぃ) まで読める幅。並走の間隔は線の太さ (2px) より少し広く
const FULL: Size = {
  cellW: 26,
  cellH: 18,
  gap: 3,
  labelW: 26,
  headH: 12,
  restGap: 8,
  arrowW: 10,
  lane: 2.5,
  stroke: 2,
  hasText: true,
}
// ミニ: ★ / 編集 のボタン (高さ約 38px) の横に収まる大きさ。かなは読めないので描かない
const MINI: Size = {
  cellW: 11,
  cellH: 7,
  gap: 2,
  labelW: 0,
  headH: 0,
  restGap: 4,
  arrowW: 4,
  lane: 1.5,
  stroke: 1.5,
  hasText: false,
}
// 長押しとみなす長さ。iOS の文字選択 (約 500ms) より先に出す
const LONG_PRESS_MS = 350
// ポップアップとミニ表示の間。指で隠れないよう少し離す
const POP_GAP = 8

const ROW_LABEL: Record<CoverRow, string> = {
  d0: '2桁',
  d1: '2桁',
  core: 'core',
  sub: 'sub',
  bad: 'bad',
}

type Point = { x: number; y: number }

function geometry(rows: CoverRow[], s: Size) {
  const colX = (col: number) => s.labelW + col * (s.cellW + s.gap)
  const restX = colX(DIGIT_COUNT) + s.restGap - s.gap
  const rowY = (row: CoverRow) =>
    s.headH + rows.indexOf(row) * (s.cellH + s.gap)
  const width = restX + s.cellW + s.arrowW
  const height = s.headH + rows.length * (s.cellH + s.gap) - s.gap
  const cellBox = (cell: { row: CoverRow; col: number; span: number }) => ({
    x: colX(cell.col),
    y: rowY(cell.row),
    w: cell.span * s.cellW + (cell.span - 1) * s.gap,
  })
  const center = (node: CoverNode, span: number): Point => {
    const b = cellBox({ ...node, span })
    return { x: b.x + b.w / 2, y: b.y + s.cellH / 2 }
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

function CoverSvg({ cover, size: s }: { cover: Cover; size: Size }) {
  const g = geometry(cover.rows, s)
  const used = new Set(cover.words.flatMap((w) => w.nodes.map(nodeKey)))
  const rests = restCells(cover.words)
  const lane = (i: number) => (i - (cover.words.length - 1) / 2) * s.lane
  const radius = s.hasText ? 4 : 2

  const path = (w: CoverWord, i: number) => {
    const dy = lane(i)
    const pts = w.nodes.map((n) => {
      const p = g.center(n, spanOf(n.row))
      return { x: p.x, y: p.y + dy }
    })
    if (w.rest) {
      const last = pts[pts.length - 1]
      pts.push({ x: g.restX + s.cellW + s.arrowW - 1, y: last.y })
    }
    const d = pts.map((p, k) => `${k ? 'L' : 'M'}${p.x} ${p.y}`).join(' ')
    return (
      <g key={w.slot} class={'tc-path kind-' + w.kind}>
        <path d={d} style={{ strokeWidth: s.stroke }} />
        {w.nodes.length === 1 && !w.rest ? (
          <circle cx={pts[0].x} cy={pts[0].y} r={s.stroke + 0.5} />
        ) : null}
      </g>
    )
  }

  const kanaText = (
    key: string,
    x: number,
    y: number,
    kana: string,
    isOn: boolean
  ) => (
    <text
      key={key}
      class={'tc-kana' + (isOn ? ' on' : '')}
      x={x}
      y={y + s.cellH / 2 + 4}
    >
      {kana}
    </text>
  )

  return (
    <svg
      width={g.width}
      height={g.height}
      viewBox={`0 0 ${g.width} ${g.height}`}
      role="img"
    >
      {s.hasText ? (
        <>
          {[...cover.num].map((digit, col) => (
            <text key={col} class="tc-head" x={g.colX(col) + s.cellW / 2} y={9}>
              {digit}
            </text>
          ))}
          <text class="tc-head" x={g.restX + s.cellW / 2} y={9}>
            余り
          </text>
          {cover.rows.map((row) => (
            <text
              key={row}
              class="tc-label"
              x={s.labelW - 4}
              y={g.rowY(row) + s.cellH / 2 + 3}
            >
              {ROW_LABEL[row]}
            </text>
          ))}
        </>
      ) : null}
      <line
        class="tc-divider"
        x1={g.restX - s.restGap / 2}
        x2={g.restX - s.restGap / 2}
        y1={Math.max(0, s.headH - 2)}
        y2={g.height}
      />
      {cover.cells.map((c) => {
        const b = g.cellBox(c)
        const cls =
          (used.has(nodeKey(c)) ? ' on' : '') + (c.kana ? '' : ' none')
        return (
          <g key={nodeKey(c)} class={'tc-cell' + cls}>
            <rect x={b.x} y={b.y} width={b.w} height={s.cellH} rx={radius} />
          </g>
        )
      })}
      {rests.map((r) => (
        <g key={'rest:' + r.row} class="tc-cell on rest">
          <rect
            x={g.restX}
            y={g.rowY(r.row)}
            width={s.cellW}
            height={s.cellH}
            rx={radius}
          />
        </g>
      ))}
      {cover.words.map(path)}
      {/* かなは線の上に出す (線が文字を潰さないように) */}
      {s.hasText
        ? [
            ...cover.cells.map((c) => {
              const b = g.cellBox(c)
              return kanaText(
                't:' + nodeKey(c),
                b.x + b.w / 2,
                b.y,
                c.kana || '—',
                used.has(nodeKey(c))
              )
            }),
            ...rests.map((r) =>
              kanaText(
                'rt:' + r.row,
                g.restX + s.cellW / 2,
                g.rowY(r.row),
                r.kana,
                true
              )
            ),
          ]
        : null}
    </svg>
  )
}

/** 長押ししている間だけ true。スクロールに変わったら (pointercancel) 閉じる */
function usePressHold() {
  const [isHeld, setIsHeld] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const clear = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
  }
  const release = () => {
    clear()
    setIsHeld(false)
  }
  useEffect(() => clear, [])
  return {
    isHeld,
    handlers: {
      onPointerDown: () => {
        clear()
        timer.current = setTimeout(() => setIsHeld(true), LONG_PRESS_MS)
      },
      onPointerUp: release,
      onPointerCancel: release,
      onPointerLeave: release,
      // 長押しで出る iOS / Android のメニューを出さない
      onContextMenu: (e: Event) => e.preventDefault(),
    },
  }
}

type Props = { d: NumberEntry }

function TierCover({ d }: Props) {
  const tables = useReadingTables()
  const cover = useMemo(
    () => (tables ? buildTierCover(tables, d) : null),
    [tables, d]
  )
  const { isHeld, handlers } = usePressHold()
  const anchor = useRef<HTMLDivElement>(null)
  if (!cover || cover.words.length === 0) return null

  // 詳細パネルは overflow で切れるので、ポップアップは body に出して画面座標で置く
  const rect = isHeld ? anchor.current?.getBoundingClientRect() : null
  const label = `${cover.num} の読みを登録語がどれだけ通っているか (長押しで拡大)`
  return (
    <div
      ref={anchor}
      class="tier-cover"
      aria-label={label}
      title={label}
      {...handlers}
    >
      <CoverSvg cover={cover} size={MINI} />
      {rect
        ? createPortal(
            <div
              class="tier-cover-pop"
              style={{
                left: `${Math.max(8, rect.left)}px`,
                // 下端をミニ表示の上端に合わせる (innerHeight はブラウザ UI の出し入れでずれるので使わない)
                top: `${rect.top - POP_GAP}px`,
              }}
            >
              <CoverSvg cover={cover} size={FULL} />
            </div>,
            document.body
          )
        : null}
    </div>
  )
}

export default TierCover
