import { describe, it, expect } from 'vitest'
import { speechText, spellOut, wordSpeech } from '../lib/slideSpeech'

describe('slideSpeech', () => {
  it('数字は 1 字ずつ区切る', () => {
    expect(spellOut('007')).toBe('0、0、7')
    expect(spellOut('A3')).toBe('A、3')
  })

  it('語はよみを優先し、記法を外したひらがなで読む', () => {
    expect(wordSpeech('鯉#g', 'こい')).toBe('こい')
    expect(wordSpeech('さばんな', 'さばﾝな')).toBe('さばんな')
    expect(wordSpeech('鯉#g -n')).toBe('鯉')
  })

  const speech = { prompt: '1、2、3', answer: 'ひふみ' }

  it('問題面は問題だけ読む', () => {
    expect(speechText(speech, 'prompt', false)).toBe('1、2、3')
  })

  it('問題面を読んだ後の答え面は答えだけ読む', () => {
    expect(speechText(speech, 'answer', true)).toBe('ひふみ')
  })

  it('いきなり答え面なら問題から続けて読む', () => {
    expect(speechText(speech, 'answer', false)).toBe('1、2、3。ひふみ')
  })

  it('読む文が無ければ空', () => {
    expect(speechText(undefined, 'answer', false)).toBe('')
    expect(speechText({ answer: 'x' }, 'prompt', false)).toBe('')
  })
})
