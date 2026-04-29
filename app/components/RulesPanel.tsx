import type { RulesData } from '../data/schema'

type Props = {
  rules: RulesData
}

const TIER_LABELS = [
  { key: 'core', label: 'core', score: 10 },
  { key: 'sub', label: 'sub', score: 8 },
  { key: 'bad', label: 'bad', score: 6 },
] as const

function SingleDigitTable({ rules }: Props) {
  return (
    <div class="rules-section">
      <div class="rules-section-title">1桁マッピング</div>
      <div class="rules-section-desc">
        各数字 0-9 に対するかな。core/sub/bad の3ティアでスコアが変わる。
      </div>
      <table class="rules-single-table">
        <thead>
          <tr>
            <th class="rules-tier-head">tier</th>
            {Array.from({ length: 10 }, (_, d) => (
              <th key={d}>{d}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {TIER_LABELS.map(({ key, label, score }) => (
            <tr key={key}>
              <th class={'rules-tier-label rules-tier-' + key}>
                <span class="rules-tier-name">{label}</span>
                <span class="rules-tier-score">+{score}</span>
              </th>
              {Array.from({ length: 10 }, (_, d) => {
                const kanas = rules.singleByDigit[String(d)]?.[key] ?? []
                return (
                  <td key={d} class={'rules-tier-cell rules-tier-' + key}>
                    {kanas.join('・') || '—'}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

// 第1桁を「拗音子音」「単音子音」「外来音」に分けたラベル
// 各カテゴリに該当する子音/かなが無ければ '—'
const ROW_YOUON: string[] = [
  '—',
  'hy',
  'ch',
  'my',
  'sy',
  '—',
  'ry/jy',
  '—',
  '—',
  'ky',
]
const ROW_PLAIN: string[] = [
  'ma',
  'to',
  'chi/tsu',
  's*',
  'yu',
  'ta/te',
  'm*',
  'n*',
  'h*/wa',
  'ke',
]
const ROW_FOREIGN: string[] = [
  '—',
  'ti/ie/tu',
  'fi',
  '—',
  '—',
  'fa/fe/fo/tyu',
  '—',
  'wi/wa/we/wo',
  '—',
  '—',
]

// 列 (第2桁) のカテゴリ別ラベル
const COL_YOUON: string[] = [
  '—',
  '—',
  '—',
  '—',
  'yo[ョ]',
  '—',
  '—',
  'yu[ュ]',
  'ya[ャ]',
  '—',
]
const COL_VOWEL: string[] = [
  'a',
  '—',
  'i (chi)',
  'u',
  '—',
  'o',
  '—',
  '—',
  'wa',
  'e',
]
const COL_FOREIGN: string[] = [
  '—',
  '-i',
  '—',
  '—',
  '-o',
  '—',
  '—',
  '-yu',
  '-a',
  '-e',
]

function PatternRows({
  title,
  desc,
  axisLabel,
  rows,
}: {
  title: string
  desc: string
  axisLabel: string
  rows: { label: string; cells: string[] }[]
}) {
  return (
    <div class="rules-section">
      <div class="rules-section-title">{title}</div>
      <div class="rules-section-desc">{desc}</div>
      <table class="rules-pattern-table">
        <tbody>
          <tr>
            <th class="rules-pattern-axis">{axisLabel}</th>
            {Array.from({ length: 10 }, (_, d) => (
              <th key={d} class="rules-pattern-digit">
                {d}
              </th>
            ))}
          </tr>
          {rows.map((row) => (
            <tr key={row.label}>
              <th class="rules-pattern-axis">{row.label}</th>
              {row.cells.map((cell, d) => (
                <td
                  key={d}
                  class={'rules-pattern-cell' + (cell === '—' ? ' empty' : '')}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function MatrixTable({
  title,
  desc,
  matrix,
}: {
  title: string
  desc: string
  matrix: string[][][]
}) {
  return (
    <div class="rules-section">
      <div class="rules-section-title">{title}</div>
      <div class="rules-section-desc">{desc}</div>
      <table class="rules-matrix-table">
        <thead>
          <tr>
            <th class="rules-mx-corner">行＼列</th>
            {Array.from({ length: 10 }, (_, c) => (
              <th key={c}>{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, r) => (
            <tr key={r}>
              <th>{r}</th>
              {row.map((cell, c) => (
                <td
                  key={c}
                  class={'rules-mx-cell' + (cell.length > 0 ? ' filled' : '')}
                >
                  {cell.length > 0 ? cell.join('/') : ''}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WeightTable({ rules }: Props) {
  const entries = Object.entries(rules.weights)
  return (
    <div class="rules-section">
      <div class="rules-section-title">スコア重み</div>
      <div class="rules-section-desc">
        トークン分類およびグローバル補正のスコア定義（targetDigits=3）。
      </div>
      <div class="rules-weights">
        {entries.map(([key, value]) => (
          <div
            key={key}
            class={'rules-weight-row ' + (value >= 0 ? 'pos' : 'neg')}
          >
            <span class="rules-weight-key">{key}</span>
            <span class="rules-weight-val">
              {value > 0 ? '+' : ''}
              {value}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function RulesPanel({ rules }: Props) {
  return (
    <div class="content rules-panel">
      <SingleDigitTable rules={rules} />
      <MatrixTable
        title="2桁マッピング"
        desc="行=第1桁、列=第2桁。1単位で2桁を表す全かな。複数候補は / 区切り。"
        matrix={rules.doubleMatrix}
      />
      <PatternRows
        title="行サマリ (第1桁=子音グループ)"
        desc="0-9 各行をカテゴリ別に分解 (拗音子音 / 単音子音 / 外来音)。"
        axisLabel="桁1"
        rows={[
          { label: '拗音 (Cy_)', cells: ROW_YOUON },
          { label: '単音 (CV)', cells: ROW_PLAIN },
          { label: '外来', cells: ROW_FOREIGN },
        ]}
      />
      <PatternRows
        title="列サマリ (第2桁=母音/拗音末尾)"
        desc="拗音規則: ャ→8, ュ→7, ョ→4。「ー」(伸ばし) は前の母音と同じ桁。"
        axisLabel="桁2"
        rows={[
          { label: '拗音末尾', cells: COL_YOUON },
          { label: '母音', cells: COL_VOWEL },
          { label: '外来 (小ぁぃぅぇぉ)', cells: COL_FOREIGN },
        ]}
      />
      <MatrixTable
        title="撥音・長音マッピング"
        desc="ん/ー を含む2桁単位。例: いん→11, さん→33, いー→12。"
        matrix={rules.longMatrix}
      />
      <WeightTable rules={rules} />
    </div>
  )
}

export default RulesPanel
