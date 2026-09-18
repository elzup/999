import type { ChoiceQuestion } from '../components/ChoiceQuiz'
import ffJson from '../data/ff.json'
import { containsJunk } from '../../src/data/junk.js'
import {
  buildWordIndex,
  entriesOfHex,
  targetsOf,
} from '../../src/data/memo-target.js'

export type FfRow = {
  hex: string
  type: string
  bin: string
  exp: string
  word: string
  kana: string
  read: string
}

export const FF_ROWS = ffJson as FfRow[]

// テストの「語」面: phonetic(いーごひよこ)ではなく語/かな。漢字語があればそれを優先。
const readLabel = (r: FfRow) => r.word || r.kana

// 出題に使える行(語/かな・hex・bin が揃っていて欠損記号を含まない)。
// 欠損記号の一覧は src/data/junk.js が正本 (lyrics/json 生成側と共有する)。
export const isValidFfRow = (row: FfRow) =>
  Boolean(readLabel(row) && row.hex && row.bin) &&
  ![readLabel(row), row.hex, row.bin].some(containsJunk)

const VALID = FF_ROWS.filter(isValidFfRow)

// 語 → 対象 の逆引き (多対多)。3 領域共通の索引なので、数字・カードと
// 突き合わせるときも同じ形で引ける。
const WORD_INDEX = buildWordIndex(VALID.flatMap(entriesOfHex))

/** その語が指す hex すべて。ピッピ (1B / B1) のような重複割当は 2 件返る */
const hexesOf = (label: string) =>
  targetsOf(WORD_INDEX, label).map((t) => t.key)

// 語 → hex は同じ語が複数の hex を指しうる。以前はその語を丸ごと出題から
// 外していたが (6 行が黙って練習対象外だった)、語ごとに 1 問へまとめ、
// 指している hex はどれを選んでも正解として扱う。
const READ_ROWS = VALID.filter(
  (row, i, rows) =>
    rows.findIndex((other) => readLabel(other) === readLabel(row)) === i
)

export type FfDir = 'hex2read' | 'read2hex' | 'bin2hex' | 'hex2bin'

// prompt(出題面) / answer(正解面) / pool(誤答の母集団) / choices(選択肢数) / title
const DIR: Record<
  FfDir,
  {
    title: string
    prompt: (r: FfRow) => string
    answer: (r: FfRow) => string
    /** 正解として受け付ける値。省略時は answer だけ */
    accepted?: (r: FfRow) => string[]
    pool: (r: FfRow) => string
    choices: number
    promptClass?: string
  }
> = {
  hex2read: {
    title: 'hex → 語',
    prompt: (r) => r.hex,
    answer: (r) => readLabel(r),
    pool: (r) => readLabel(r),
    choices: 4,
    promptClass: 'ff-quiz-hex',
  },
  read2hex: {
    title: '語 → hex',
    prompt: (r) => readLabel(r),
    answer: (r) => r.hex,
    accepted: (r) => hexesOf(readLabel(r)),
    pool: (r) => r.hex,
    choices: 4,
  },
  bin2hex: {
    title: 'bin → hex',
    prompt: (r) => r.bin,
    answer: (r) => r.hex,
    pool: (r) => r.hex,
    choices: 4,
    promptClass: 'ff-quiz-bin',
  },
  hex2bin: {
    title: 'hex → bin',
    prompt: (r) => r.hex,
    answer: (r) => r.bin,
    pool: (r) => r.bin,
    choices: 4,
    promptClass: 'ff-quiz-hex',
  },
}

export const FF_DIRS = Object.keys(DIR) as FfDir[]
export const ffDirTitle = (d: FfDir) => DIR[d].title
export const ffPromptClass = (d: FfDir) => DIR[d].promptClass

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function withDistractors(
  pool: string[],
  accepted: string[],
  n: number
): string[] {
  const others = shuffle(pool.filter((v) => !accepted.includes(v))).slice(
    0,
    Math.max(0, n - accepted.length)
  )
  return shuffle([...accepted, ...others])
}

export const FF_QUIZ_LEN = 10

const normalizeQuestionCount = (count: number) =>
  Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0

/** 指定方向のクイズ設問(既定10問)を組む */
export function buildFfQuestions(
  dir: FfDir,
  count = FF_QUIZ_LEN
): ChoiceQuestion[] {
  const cfg = DIR[dir]
  const pool = [...new Set(VALID.map(cfg.pool))]
  const n = Math.min(cfg.choices, pool.length)
  const questionCount = normalizeQuestionCount(count)
  const rows = dir === 'read2hex' ? READ_ROWS : VALID
  return shuffle(rows)
    .slice(0, questionCount)
    .map((r) => {
      const answer = cfg.answer(r)
      const accepted = cfg.accepted?.(r) ?? [answer]
      return {
        prompt: cfg.prompt(r),
        answer,
        ...(accepted.length > 1 ? { answers: accepted } : {}),
        choices: withDistractors(pool, accepted, n),
      }
    })
}

// --- nibble 練習: 一桁ずつキーで答える(語データ非依存) ---
export type KeypadQuestion = {
  prompt: string
  answer: string
  promptClass?: string
}
export type NibbleKind = 'b2h' | 'h2b'
export const NIBBLE: Record<NibbleKind, { title: string; pad: 'hex' | 'bin' }> =
  {
    b2h: { title: 'bin(4bit) → hex', pad: 'hex' },
    h2b: { title: 'hex → bin(4bit)', pad: 'bin' },
  }
export const NIBBLE_KINDS = Object.keys(NIBBLE) as NibbleKind[]

/** 0-15 をランダム出題。b2h: bin4→hex1 / h2b: hex1→bin4 */
export function buildNibble(
  kind: NibbleKind,
  count = FF_QUIZ_LEN
): KeypadQuestion[] {
  const questionCount = normalizeQuestionCount(count)
  return Array.from({ length: questionCount }, () =>
    Math.floor(Math.random() * 16)
  ).map((v) => {
    const hex = v.toString(16).toUpperCase()
    const bin = v.toString(2).padStart(4, '0')
    return kind === 'b2h'
      ? { prompt: bin, answer: hex, promptClass: 'ff-quiz-bin' }
      : { prompt: hex, answer: bin, promptClass: 'ff-quiz-hex' }
  })
}
