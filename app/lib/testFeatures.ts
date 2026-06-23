export const TEST_INPUT_METHODS = ['number', 'choice', 'advance'] as const

export type TestInputMethod = typeof TEST_INPUT_METHODS[number]

export const TEST_INPUT_METHOD_LABEL: Record<TestInputMethod, string> = {
  number: '数字入力',
  choice: '選択肢',
  advance: '送るだけ',
}

export type TestFeature = {
  id: string
  title: string
  inputMethod: TestInputMethod
  hasRecords?: boolean
}

export function groupTestFeaturesByInputMethod(features: TestFeature[]) {
  return TEST_INPUT_METHODS.map((inputMethod) => ({
    inputMethod,
    label: TEST_INPUT_METHOD_LABEL[inputMethod],
    features: features.filter((feature) => feature.inputMethod === inputMethod),
  })).filter((group) => group.features.length > 0)
}
