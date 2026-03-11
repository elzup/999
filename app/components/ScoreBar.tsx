const SCORE_MIN = 10
const SCORE_MAX = 50

type Props = {
  label: string
  score: number
  error?: string
}

function ScoreBar({ label, score, error }: Props) {
  const pct = Math.max(
    0,
    Math.min(100, ((score - SCORE_MIN) / (SCORE_MAX - SCORE_MIN)) * 100)
  )
  const color =
    score >= 35 ? '#4ade80' : score >= 25 ? '#fbbf24' : '#f87171'

  return (
    <div class="detail-score">
      <div class="ds-top">
        <span class="ds-label">{label}</span>
        <span class="ds-val">{score}</span>
        {error ? (
          <span style={{ color: '#f87171', fontSize: '10px' }}>
            ⚠{error}
          </span>
        ) : null}
      </div>
      <div class="ds-bar">
        <div
          class="ds-fill"
          style={{ width: pct + '%', background: color }}
        />
      </div>
    </div>
  )
}

export default ScoreBar
