import { describe, expect, it } from 'vitest'
import {
  TEST_INPUT_METHOD_LABEL,
  groupTestFeaturesByInputMethod,
  type TestFeature,
} from '../lib/testFeatures'

describe('testFeatures', () => {
  it('入力方法ラベルを定義する', () => {
    expect(TEST_INPUT_METHOD_LABEL).toEqual({
      number: '数字入力',
      choice: '選択肢',
      advance: '送るだけ',
    })
  })

  it('テスト機能を入力方法ごとにリスト化する', () => {
    const features: TestFeature[] = [
      { id: 'pi', title: 'π', inputMethod: 'number' },
      { id: 'card-choice', title: 'カード', inputMethod: 'choice' },
      { id: 'card-train', title: 'カード連想', inputMethod: 'advance' },
    ]

    expect(groupTestFeaturesByInputMethod(features)).toEqual([
      {
        inputMethod: 'number',
        label: '数字入力',
        features: [{ id: 'pi', title: 'π', inputMethod: 'number' }],
      },
      {
        inputMethod: 'choice',
        label: '選択肢',
        features: [
          { id: 'card-choice', title: 'カード', inputMethod: 'choice' },
        ],
      },
      {
        inputMethod: 'advance',
        label: '送るだけ',
        features: [
          { id: 'card-train', title: 'カード連想', inputMethod: 'advance' },
        ],
      },
    ])
  })
})
