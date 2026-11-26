// 語の格 (悪い順と同じ判定: worstRank.ts) を色付きの番号で出す (D-0171)。
// 番号 = 当たる型のうち一番悪い型の順位 (1〜20、小さいほど良い)。触れると型の名前が出る
import { gradeColor } from '../lib/gradeColor'
import { grade, patternName, type Graded } from '../lib/worstRank'

type Props =
  | { graded: Graded }
  | { num: string; kana: string; rankey: string; word: string }

const gradedOf = (props: Props): Graded =>
  'graded' in props
    ? props.graded
    : grade(props.num, props.kana, props.rankey, /#g\b/.test(props.word))

function GradeBadge(props: Props) {
  if (!('graded' in props) && !props.rankey) return null
  const g = gradedOf(props)
  return (
    <span
      class="grade-badge"
      style={{ background: gradeColor(g.worst) }}
      title={patternName(g.ids[g.ids.length - 1] ?? 'double')}
    >
      {g.worst}
    </span>
  )
}

export default GradeBadge
