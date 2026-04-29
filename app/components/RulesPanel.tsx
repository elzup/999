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

// 第1桁ごとの主要パターンラベル (子音グループ)
const ROW_LABEL: string[] = [
  'ma',
  'hy',
  'ch',
  'my',
  'sy',
  't',
  'ry/jy',
  'n',
  'h',
  'ky',
]

// 第2桁ごとの主要パターンラベル (母音/拗音末尾)
const COL_LABEL: string[] = [
  'a',
  "i'",
  'chi',
  'u',
  'yo[ョ]',
  'o',
  '—',
  'yu[ュ]',
  'ya[ャ]',
  'e',
]

// 撥音・長音用のラベル
const LONG_COL_LABEL: string[] = [
  '—',
  '-ん',
  '-ー',
  '—',
  '-ー',
  '—',
  '—',
  '-ん',
  '—',
  '-ー',
]

function MatrixTable({
  title,
  desc,
  matrix,
  rowLabels,
  colLabels,
}: {
  title: string
  desc: string
  matrix: string[][][]
  rowLabels?: string[]
  colLabels?: string[]
}) {
  return (
    <div class="rules-section">
      <div class="rules-section-title">{title}</div>
      <div class="rules-section-desc">{desc}</div>
      <table class="rules-matrix-table">
        <thead>
          <tr>
            <th class="rules-mx-corner" colSpan={2}>
              行＼列
            </th>
            {Array.from({ length: 10 }, (_, c) => (
              <th key={c} class="rules-mx-digit">
                {c}
              </th>
            ))}
          </tr>
          {colLabels && (
            <tr>
              <th class="rules-mx-corner" colSpan={2}>
                pattern
              </th>
              {colLabels.map((label, c) => (
                <th
                  key={c}
                  class={'rules-mx-label' + (label === '—' ? ' empty' : '')}
                >
                  {label}
                </th>
              ))}
            </tr>
          )}
        </thead>
        <tbody>
          {matrix.map((row, r) => (
            <tr key={r}>
              <th class="rules-mx-digit">{r}</th>
              <th
                class={
                  'rules-mx-label' + (rowLabels?.[r] === '—' ? ' empty' : '')
                }
              >
                {rowLabels?.[r] ?? ''}
              </th>
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
        desc="行=第1桁(子音グループ)、列=第2桁(母音/拗音末尾)。pattern行/列が代表ラベル。"
        matrix={rules.doubleMatrix}
        rowLabels={ROW_LABEL}
        colLabels={COL_LABEL}
      />
      <MatrixTable
        title="撥音・長音マッピング"
        desc="ん/ー を含む2桁単位。例: いん→11, さん→33, いー→12。「ー」は前の母音と同じ桁。"
        matrix={rules.longMatrix}
        rowLabels={ROW_LABEL}
        colLabels={LONG_COL_LABEL}
      />
      <WeightTable rules={rules} />
    </div>
  )
}

export default RulesPanel
