import { h } from 'preact'
import type { TestFeature } from '../lib/testFeatures'
import { TEST_INPUT_METHOD_LABEL } from '../lib/testFeatures'

export type TestFeatureAction = TestFeature & {
  onStart: () => void
  onShowRecords?: () => void
}

type Props = {
  features: TestFeatureAction[]
}

// テスト開始ボタンはこの部品だけで描く (見た目は 1 種類。dock でも一覧ページでも同じ)
function TestFeatureList({ features }: Props) {
  return (
    <div class="test-feature-list">
      {features.map((feature) => (
        <div
          key={feature.id}
          class={'test-feature-item' + (feature.lastDone ? ' is-last' : '')}
        >
          <button class="test-feature-start" onClick={feature.onStart}>
            <span class="test-feature-title">{feature.title}</span>
            {feature.lastDone ? (
              <span class="test-feature-last">前回</span>
            ) : null}
            <span class={'test-feature-method ' + feature.inputMethod}>
              {TEST_INPUT_METHOD_LABEL[feature.inputMethod]}
            </span>
          </button>
          {feature.onShowRecords ? (
            <button
              class="test-feature-records"
              style={feature.hasRecords ? undefined : { opacity: 0.5 }}
              title={`${feature.title}の記録`}
              onClick={feature.onShowRecords}
            >
              記録
            </button>
          ) : null}
        </div>
      ))}
    </div>
  )
}

/** 見出し付きのまとまり (FF テストの 1 桁 / 2 桁 など) */
export function TestFeatureSection({
  label,
  children,
}: {
  label: string
  children: h.JSX.Element | h.JSX.Element[] | null
}) {
  return (
    <div class="test-feature-section">
      <div class="test-feature-section-label">{label}</div>
      {children}
    </div>
  )
}

export default TestFeatureList
