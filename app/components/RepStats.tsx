// 代表の進み具合の統計 (候補タブの 代表 > 統計)。
// XY (百×十) と YZ (十×一) の 10×10 に «代表を決めた番号の数» を出し、行と列の合計を付ける。
// 複合は ①② まで / ① だけ を 1 セルに並べる (十の位の割合バーと同じ色)。
// セルの濃さは決めた割合 (1 色の濃淡)。数はセルに書くので色だけに頼らない。
import { useState } from 'preact/hooks'
import { Segmented } from './Segmented'
import type { NumberDoc } from '../lib/numberApi'
import {
  allCount,
  repMatrix,
  setCount,
  type Axis,
  type LevelCounts,
} from '../lib/repStats'

const DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]
const AXIS_LABELS: Record<Axis, { row: string; col: string; title: string }> = {
  xy: { row: '百', col: '十', title: 'XY (百×十)' },
  yz: { row: '十', col: '一', title: 'YZ (十×一)' },
}

const ratio = (counts: LevelCounts) => {
  const all = allCount(counts)
  return all ? setCount(counts) / all : 0
}

/** セルの読み上げ / ツールチップ */
const describe = (label: string, counts: LevelCounts) =>
  `${label}: 決めた ${setCount(counts)} / ${allCount(counts)} (①② ${counts[2]} · ① だけ ${counts[1]} · 未確定 ${counts[0]})`

type Mode = 'set' | 'levels'

function Cell({
  counts,
  label,
  mode,
  isSum,
}: {
  counts: LevelCounts
  label: string
  mode: Mode
  isSum?: boolean
}) {
  const all = allCount(counts)
  return (
    <td
      class={'rs-cell' + (isSum ? ' is-sum' : '') + (all ? '' : ' is-empty')}
      style={{ '--rs-ratio': ratio(counts) }}
      title={describe(label, counts)}
    >
      {!all ? (
        ''
      ) : mode === 'set' ? (
        setCount(counts)
      ) : (
        <span class="rs-levels">
          <span class="rs-lv2">{counts[2]}</span>
          <span class="rs-lv1">{counts[1]}</span>
        </span>
      )}
    </td>
  )
}

function MatrixTable({
  docs,
  axis,
  mode,
}: {
  docs: NumberDoc[]
  axis: Axis
  mode: Mode
}) {
  const m = repMatrix(docs, axis)
  const { row, col } = AXIS_LABELS[axis]
  const cellLabel = (r: number, c: number) =>
    axis === 'xy' ? `${r}${c}_` : `_${r}${c}`
  return (
    <table class="rs-table">
      <thead>
        <tr>
          <th class="rs-corner">
            {row}／{col}
          </th>
          {DIGITS.map((c) => (
            <th key={c}>{c}</th>
          ))}
          <th class="rs-sum-head">Σ</th>
        </tr>
      </thead>
      <tbody>
        {DIGITS.map((r) => (
          <tr key={r}>
            <th>{r}</th>
            {DIGITS.map((c) => (
              <Cell
                key={c}
                counts={m.cells[r][c]}
                label={cellLabel(r, c)}
                mode={mode}
              />
            ))}
            <Cell counts={m.rows[r]} label={`${row} ${r}`} mode={mode} isSum />
          </tr>
        ))}
        <tr>
          <th class="rs-sum-head">Σ</th>
          {DIGITS.map((c) => (
            <Cell
              key={c}
              counts={m.cols[c]}
              label={`${col} ${c}`}
              mode={mode}
              isSum
            />
          ))}
          <Cell counts={m.total} label="全体" mode={mode} isSum />
        </tr>
      </tbody>
    </table>
  )
}

export default function RepStats({
  docs,
  loadedHundreds,
}: {
  docs: NumberDoc[]
  /** 読み込めた百の位の数 (10 で全部) */
  loadedHundreds: number
}) {
  const [levelsAxis, setLevelsAxis] = useState<Axis>('xy')
  const total = repMatrix(docs, 'xy').total
  return (
    <div class="rs stack-up" style={{ '--stack-gap': '14px' }}>
      <section class="rs-section">
        <h3 class="rs-title">
          決めた番号 {setCount(total)} / {allCount(total)}
          {loadedHundreds < 10 ? (
            <span class="rs-note"> (読み込み中 {loadedHundreds}/10)</span>
          ) : null}
        </h3>
        <p class="rs-note">
          セルは 10 番号のうち代表を決めた数。濃いほど決めた割合が高い
        </p>
      </section>
      {(['xy', 'yz'] as const).map((axis) => (
        <section key={axis} class="rs-section">
          <h3 class="rs-title">{AXIS_LABELS[axis].title}</h3>
          <MatrixTable docs={docs} axis={axis} mode="set" />
        </section>
      ))}
      <section class="rs-section">
        <h3 class="rs-title">
          複合 (①② / ① だけ)
          <span class="rs-axis">
            <Segmented
              ariaLabel="軸"
              options={(['xy', 'yz'] as const).map((axis) => ({
                id: axis,
                label: axis.toUpperCase(),
              }))}
              value={levelsAxis}
              onChange={setLevelsAxis}
            />
          </span>
        </h3>
        <p class="rs-legend">
          <span class="rs-key is-lv2" aria-hidden="true" />
          ①② まで
          <span class="rs-key is-lv1" aria-hidden="true" />① だけ
        </p>
        <MatrixTable docs={docs} axis={levelsAxis} mode="levels" />
      </section>
    </div>
  )
}
