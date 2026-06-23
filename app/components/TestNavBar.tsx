import { h } from 'preact'

type Props = {
  onPrev: () => void
  prevDisabled?: boolean
  onSkip?: () => void
  skipDisabled?: boolean
}

// テスト中の「← 1問戻る」「スキップ →」操作バー。各テスト共通。
// .test-footer 内に置き、テンキー等の入力UIの直上に並べる。
// スキップが無いテスト (選択肢式・即確定式) では onSkip を省略する。
function TestNavBar({ onPrev, prevDisabled, onSkip, skipDisabled }: Props) {
  return (
    <div class="test-nav">
      <button
        class="filter-btn test-nav-btn"
        disabled={prevDisabled}
        onClick={onPrev}
      >
        ← 1問戻る
      </button>
      {onSkip ? (
        <button
          class="filter-btn test-nav-btn"
          disabled={skipDisabled}
          onClick={onSkip}
        >
          スキップ →
        </button>
      ) : null}
    </div>
  )
}

export default TestNavBar
