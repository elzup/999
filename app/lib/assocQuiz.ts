// 999「数字 → 語」連想テストの純ロジック。
// 数字(例 573)を見せ、その採用語(候補の第一スロット)を4択から選ぶ。
// UI 非依存・rng 注入で決定的にテストできる。

import type { NumberEntry } from '../data/schema'
import { candidatesOf } from './choice'
import { shuffle } from './kukuQuiz'
import type { ChoiceQuestion } from '../components/ChoiceQuiz'

export type AssocItem = { num: string; word: string }

/** 語(採用候補の先頭)を持つ entry だけを num→word に落とす */
export function assocPool(entries: readonly NumberEntry[]): AssocItem[] {
  const out: AssocItem[] = []
  for (const entry of entries) {
    const word = candidatesOf(entry)[0]?.word
    if (!word) continue
    out.push({ num: entry.num, word })
  }
  return out
}

/**
 * item の誤答語を pool から選ぶ。正解語と重複するものは除外し、語は一意にする。
 */
export function pickWordDistractors(
  item: AssocItem,
  pool: readonly AssocItem[],
  count: number,
  rng: () => number
): string[] {
  const uniq = Array.from(
    new Set(pool.map((p) => p.word).filter((w) => w && w !== item.word))
  )
  return shuffle(uniq, rng).slice(0, count)
}

/** 1問ぶんの設問(選択肢はシャッフル済み・bmKey 付き)を組み立てる。 */
export function buildAssocQuestion(
  item: AssocItem,
  pool: readonly AssocItem[],
  rng: () => number,
  choiceCount = 4
): ChoiceQuestion {
  const distractors = pickWordDistractors(item, pool, choiceCount - 1, rng)
  return {
    prompt: item.num,
    answer: item.word,
    choices: shuffle([item.word, ...distractors], rng),
    bmKey: 'n:' + item.num,
  }
}

/**
 * pool から count 問の連想クイズを作る。誤答は同じ pool から採る。
 */
export function buildAssocQuiz(
  pool: readonly AssocItem[],
  count: number,
  rng: () => number,
  choiceCount = 4
): ChoiceQuestion[] {
  const picked = shuffle(pool, rng).slice(0, Math.min(count, pool.length))
  return picked.map((item) => buildAssocQuestion(item, pool, rng, choiceCount))
}
