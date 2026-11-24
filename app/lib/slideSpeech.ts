// スライドの読み上げ。端末の音声合成 (Web Speech API) で、画面を開いている間だけ読む。
// 読む文はデッキが SlideItem.speech に用意し、ここは「どの段で何を読むか」と発声だけを受け持つ。
import { stripNotation } from './kanaNotation'
import { parseWord } from './wordTags'
import type { SlidePhase } from './slideshow'

export type SlideSpeech = { prompt?: string; answer?: string }

/** 数字・hex を 1 字ずつ区切って読ませる ("123" → "1、2、3")。桁で覚えるので位取りで読ませない */
export const spellOut = (code: string) => code.split('').join('、')

/** 語は書き文字より読みが確実なので、よみ (記法を外したひらがな) を優先する */
export const wordSpeech = (word: string, kana?: string) =>
  kana ? stripNotation(kana) : parseWord(word).base

/**
 * いま読む文。答え面に入ったとき、直前に同じ 1 枚の問題面を読んでいなければ
 * (問題面の待ち 0 / 戻る で答え面から出た) 問題面から続けて読む。
 */
export function speechText(
  speech: SlideSpeech | undefined,
  phase: SlidePhase,
  promptSpoken: boolean
): string {
  if (!speech) return ''
  if (phase === 'prompt') return speech.prompt ?? ''
  const parts = promptSpoken ? [speech.answer] : [speech.prompt, speech.answer]
  return parts.filter(Boolean).join('。')
}

export const speechSupported = () =>
  typeof window !== 'undefined' &&
  'speechSynthesis' in window &&
  typeof SpeechSynthesisUtterance !== 'undefined'

function jaVoice(): SpeechSynthesisVoice | undefined {
  const voices = window.speechSynthesis.getVoices()
  return (
    voices.find((v) => v.lang === 'ja-JP' && v.localService) ??
    voices.find((v) => v.lang.replace('_', '-').startsWith('ja'))
  )
}

// onend が来ない端末 (長文の Chrome など) でも止まらないよう、読み終わりを見込みで打ち切る。
const FALLBACK_BASE_MS = 3000
const FALLBACK_PER_CHAR_MS = 400

/**
 * 1 文を読む。読み終わり (失敗・打ち切りを含む) で onDone を 1 度だけ呼ぶ。
 * 返す関数で途中止め。止めたときは onDone を呼ばない。
 */
export function speak(text: string, onDone: () => void): () => void {
  if (!speechSupported() || !text) {
    onDone()
    return () => {}
  }
  const synth = window.speechSynthesis
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    clearTimeout(fallback)
    onDone()
  }
  const utter = new SpeechSynthesisUtterance(text)
  utter.lang = 'ja-JP'
  const voice = jaVoice()
  if (voice) utter.voice = voice
  utter.onend = finish
  utter.onerror = finish
  const fallback = setTimeout(
    finish,
    FALLBACK_BASE_MS + text.length * FALLBACK_PER_CHAR_MS
  )
  synth.cancel()
  synth.speak(utter)
  return () => {
    finished = true
    clearTimeout(fallback)
    synth.cancel()
  }
}

/**
 * iOS Safari はタップの中で 1 度読ませないと、以後の読み上げを黙って捨てる。
 * 読み上げ ON / 再生 のボタンから同期で呼ぶ。
 */
export function primeSpeech() {
  if (!speechSupported()) return
  const utter = new SpeechSynthesisUtterance('')
  utter.volume = 0
  window.speechSynthesis.speak(utter)
}

export function stopSpeech() {
  if (speechSupported()) window.speechSynthesis.cancel()
}
