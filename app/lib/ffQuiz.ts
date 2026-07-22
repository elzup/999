import type { ChoiceQuestion } from '../components/ChoiceQuiz'
import ffJson from '../data/ff.json'

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

// テストの「読み」面: phonetic(いーごひよこ)ではなく語/かな。漢字語があればそれを優先。
const readLabel = (r: FfRow) => r.word || r.kana

// テスト出題に使える行(語/かな・hex・bin が揃っていて欠損記号を含まない)
const BAD = /[—＿]/
const VALID = FF_ROWS.filter(
  (r) => readLabel(r) && r.hex && r.bin && !BAD.test(readLabel(r))
)

export type FfDir = 'hex2read' | 'read2hex' | 'bin2hex' | 'hex2bin'

// prompt(出題面) / answer(正解面) / pool(誤答の母集団) / choices(選択肢数) / title
const DIR: Record<
  FfDir,
  {
    title: string
    prompt: (r: FfRow) => string
    answer: (r: FfRow) => string
    pool: (r: FfRow) => string
    choices: number
    promptClass?: string
  }
> = {
  hex2read: {
    title: 'hex → 読み',
    prompt: (r) => r.hex,
    answer: (r) => readLabel(r),
    pool: (r) => readLabel(r),
    choices: 4,
    promptClass: 'ff-quiz-hex',
  },
  read2hex: {
    title: '読み → hex',
    prompt: (r) => readLabel(r),
    answer: (r) => r.hex,
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

function withDistractors(pool: string[], answer: string, n: number): string[] {
  const others = shuffle(pool.filter((v) => v !== answer)).slice(0, n - 1)
  return shuffle([answer, ...others])
}

export const FF_QUIZ_LEN = 10

/** 指定方向のクイズ設問(既定10問)を組む */
export function buildFfQuestions(
  dir: FfDir,
  count = FF_QUIZ_LEN
): ChoiceQuestion[] {
  const cfg = DIR[dir]
  const pool = [...new Set(VALID.map(cfg.pool))]
  const n = Math.min(cfg.choices, pool.length)
  return shuffle(VALID)
    .slice(0, count)
    .map((r) => {
      const answer = cfg.answer(r)
      return {
        prompt: cfg.prompt(r),
        answer,
        choices: withDistractors(pool, answer, n),
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
  return Array.from({ length: count }, () =>
    Math.floor(Math.random() * 16)
  ).map((v) => {
    const hex = v.toString(16).toUpperCase()
    const bin = v.toString(2).padStart(4, '0')
    return kind === 'b2h'
      ? { prompt: bin, answer: hex, promptClass: 'ff-quiz-bin' }
      : { prompt: hex, answer: bin, promptClass: 'ff-quiz-hex' }
  })
}
