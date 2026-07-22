import { h } from 'preact'
import type { TestFeature } from '../lib/testFeatures'
import { TEST_INPUT_METHOD_LABEL } from '../lib/testFeatures'

export type TestFeatureAction = TestFeature & {
  onStart: () => void
  onShowRecords?: () => void
}

type Props = {
  features: TestFeatureAction[]
  compact?: boolean
}

function TestFeatureList({ features, compact }: Props) {
  return (
    <div class={'test-feature-list' + (compact ? ' compact' : '')}>
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
          {feature.hasRecords && feature.onShowRecords ? (
            <button
              class="test-feature-records"
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

export default TestFeatureList
