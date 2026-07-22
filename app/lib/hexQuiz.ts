// 16進(hex)テストの純ロジック。
// 1バイト(0-255)を「既存の10進の語(000-255)」に対応させ、
//   語 → コード(hex/2進)を選ぶ (toCode) / コード → 語を選ぶ (toWord)
// の4択クイズを組み立てる。UI 非依存・rng 注入で決定的にテストできる。
//
// toCode の誤答は「2×2」設計:
//   正解バイトの上位/下位ニブルをそれぞれ別の値へ振り、
//   {hi,hi'}×{lo,lo'} の 4 通りを選択肢にする。
//   → どの 1 桁(ニブル)だけを見ても正解を一意に絞り込めない。
//   例) 正解 AB → AB / CB / A9 / C9

import type { NumberEntry } from '../data/schema'
import { candidatesOf } from './choice'
import { shuffle } from './kukuQuiz'
import type { ChoiceQuestion } from '../components/ChoiceQuiz'

export const HEX_DIGITS = '0123456789ABCDEF'

/** コードの表記。hex=2桁16進 / bin=8桁2進 */
export type Notation = 'hex' | 'bin'
/** 出題方向。toCode=語→コード(2×2誤答) / toWord=コード→語 */
export type Direction = 'toCode' | 'toWord'

export type HexItem = { byte: number; num: string; word: string }

export type HexQuizOptions = {
  notation?: Notation
  direction?: Direction
}

/** 0-255 を 2桁の大文字16進にする (例 171 → "AB")。 */
export function toHex(byte: number): string {
  return byte.toString(16).toUpperCase().padStart(2, '0')
}

/** 0-255 を 8桁の2進にする (例 171 → "10101011")。 */
export function toBin(byte: number): string {
  return byte.toString(2).padStart(8, '0')
}

/** バイトを表記に応じた文字列へ。 */
export function formatByte(byte: number, notation: Notation): string {
  return notation === 'bin' ? toBin(byte) : toHex(byte)
}

/** 表記付きコード文字列をバイトへ戻す。壊れていれば null。 */
export function parseCode(code: string, notation: Notation): number | null {
  const n = parseInt(code, notation === 'bin' ? 2 : 16)
  return Number.isNaN(n) ? null : n
}

/** バイト → [上位ニブル, 下位ニブル] (各 0-15)。 */
export function byteToNibbles(byte: number): [number, number] {
  return [(byte >> 4) & 0xf, byte & 0xf]
}

/** [上位, 下位] ニブル → バイト。 */
export function nibblesToByte(hi: number, lo: number): number {
  return ((hi & 0xf) << 4) | (lo & 0xf)
}

/** 0-15 から n 以外を一様に選ぶ。 */
function pickOtherNibble(n: number, rng: () => number): number {
  const r = Math.floor(rng() * 15) // 0-14
  return r >= n ? r + 1 : r
}

/**
 * 正解バイトに対する 2×2 の誤答バイト3つ。
 * 上位/下位ニブルをそれぞれ別の値 hi'/lo' に振り、
 *   [hi', lo] / [hi, lo'] / [hi', lo']
 * を返す。正解 [hi, lo] と合わせて {hi,hi'}×{lo,lo'} の格子になり、
 * 4つのバイトは互いに相異なる。
 */
export function twoByTwoDistractors(
  answer: number,
  rng: () => number
): number[] {
  const [hi, lo] = byteToNibbles(answer)
  const hiAlt = pickOtherNibble(hi, rng)
  const loAlt = pickOtherNibble(lo, rng)
  return [
    nibblesToByte(hiAlt, lo),
    nibblesToByte(hi, loAlt),
    nibblesToByte(hiAlt, loAlt),
  ]
}

/**
 * 語を持つ 0-255 のバイトだけを byte→(num, word) に落とす。
 * バイト B は 10進 B の語(候補の先頭)に対応する。
 */
export function hexPool(entries: readonly NumberEntry[]): HexItem[] {
  const byNum = new Map<string, NumberEntry>()
  for (const e of entries) byNum.set(e.num, e)
  const out: HexItem[] = []
  for (let byte = 0; byte <= 255; byte++) {
    const num = String(byte).padStart(3, '0')
    const entry = byNum.get(num)
    if (!entry) continue
    const word = candidatesOf(entry)[0]?.word
    if (!word) continue
    out.push({ byte, num, word })
  }
  return out
}

/**
 * item の誤答語を pool から選ぶ。正解語と重複するものは除外し、語は一意にする。
 * (toWord 方向で使用)
 */
export function pickWordDistractors(
  item: HexItem,
  pool: readonly HexItem[],
  count: number,
  rng: () => number
): string[] {
  const uniq = Array.from(
    new Set(pool.map((p) => p.word).filter((w) => w && w !== item.word))
  )
  return shuffle(uniq, rng).slice(0, count)
}

/** 1問ぶんの設問を組み立てる(選択肢はシャッフル済み・bmKey 付き)。 */
export function buildHexQuestion(
  item: HexItem,
  pool: readonly HexItem[],
  rng: () => number,
  opts: HexQuizOptions = {}
): ChoiceQuestion {
  const notation = opts.notation ?? 'hex'
  const direction = opts.direction ?? 'toCode'
  const bmKey = 'n:' + item.num

  if (direction === 'toWord') {
    // コード → 語: prompt はコード、選択肢は他の語。
    const distractors = pickWordDistractors(item, pool, 3, rng)
    return {
      prompt: formatByte(item.byte, notation),
      answer: item.word,
      choices: shuffle([item.word, ...distractors], rng),
      bmKey,
    }
  }

  // 語 → コード: prompt は語、選択肢は 2×2 のコード。
  const distractorBytes = twoByTwoDistractors(item.byte, rng)
  const choices = shuffle(
    [item.byte, ...distractorBytes].map((b) => formatByte(b, notation)),
    rng
  )
  return {
    prompt: item.word,
    answer: formatByte(item.byte, notation),
    choices,
    bmKey,
  }
}

/** pool から count 問のクイズを作る。 */
export function buildHexQuiz(
  pool: readonly HexItem[],
  count: number,
  rng: () => number,
  opts: HexQuizOptions = {}
): ChoiceQuestion[] {
  const picked = shuffle(pool, rng).slice(0, Math.min(count, pool.length))
  return picked.map((item) => buildHexQuestion(item, pool, rng, opts))
}
