// 九九「左辺(問題 AB×C)の読み」4択クイズの純ロジック。
// 問題: AB×C を見せ、その読み(prob = 〇〇ん〇 / 〇ん〇)を4択から選ぶ。
// UI 非依存・rng 注入で決定的にテストできる。

export type KukuItem = {
  tier: string
  expr: string
  label: string
  yomi: string
  prob: string
}

export type QuizQuestion = {
  expr: string // 元の式 "44x4=176"
  left: string // 表示用 左辺 "44×4"
  answer: string // 正解の読み prob
  choices: string[] // answer を含む選択肢(シャッフル済み)
}

/** "44x4=176" -> "44×4" (左辺のみ、× 表記) */
export function exprLeft(expr: string): string {
  const [ab, rest] = expr.split('x')
  const c = rest.split('=')[0]
  return `${ab}×${c}`
}

/** rng を使った Fisher-Yates。新しい配列を返す(非破壊)。 */
export function shuffle<T>(arr: readonly T[], rng: () => number): T[] {
  const out = [...arr]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    const tmp = out[i]
    out[i] = out[j]
    out[j] = tmp
  }
  return out
}

/**
 * item の誤答を pool から選ぶ。
 * 難易度のため「同じ文字数の読み」を優先し、不足分は残りから補う。
 * answer と重複する読みは除外し、選択肢の読みは一意にする。
 */
export function pickDistractors(
  item: KukuItem,
  pool: readonly KukuItem[],
  count: number,
  rng: () => number
): string[] {
  const answer = item.prob
  const uniq = Array.from(
    new Set(pool.map((p) => p.prob).filter((p) => p && p !== answer))
  )
  const sameLen = shuffle(
    uniq.filter((p) => [...p].length === [...answer].length),
    rng
  )
  const other = shuffle(
    uniq.filter((p) => [...p].length !== [...answer].length),
    rng
  )
  return [...sameLen, ...other].slice(0, count)
}

/** 1問ぶんの設問を組み立てる(選択肢はシャッフル済み)。 */
export function buildQuestion(
  item: KukuItem,
  pool: readonly KukuItem[],
  rng: () => number,
  choiceCount = 4
): QuizQuestion {
  const distractors = pickDistractors(item, pool, choiceCount - 1, rng)
  const choices = shuffle([item.prob, ...distractors], rng)
  return {
    expr: item.expr,
    left: exprLeft(item.expr),
    answer: item.prob,
    choices,
  }
}

/**
 * items から count 問のクイズを作る。
 * 誤答は同じ items(=同 tier で呼ぶ想定)から採る。
 */
export function buildQuiz(
  items: readonly KukuItem[],
  count: number,
  rng: () => number,
  choiceCount = 4
): QuizQuestion[] {
  const picked = shuffle(items, rng).slice(0, Math.min(count, items.length))
  return picked.map((item) => buildQuestion(item, items, rng, choiceCount))
}

/** テスト用の決定的 rng (mulberry32)。 */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
