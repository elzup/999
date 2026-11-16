import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { SINGLE_DIGIT, SINGLE_TIER, DOUBLE_DIGIT, LONG_DIGIT } from './table.js'
import { WEIGHTS } from './scorer.js'
import { classify } from './goro-extract.js'
import {
  categoryScore,
  extractName,
  isKanaOnly,
  loadWords,
  toHiragana,
} from './words.js'
import { buildYomiUse } from './yomi.js'
import { parseCardsTsv } from './cards-tsv.js'
import { cardId, imageFieldsOf } from './images/targets.js'
import { tagImagesOf } from './images/tag-images.js'

const baseDir = dirname(fileURLToPath(import.meta.url))
// data.json は辞書本体 (私的連想) を含むため、公開 hosting (public/→dist) には出さず
// gitignore 済みの private/ に書き出す。配信は認証付き Cloud Function 経由のみ。
const privateDir = join(baseDir, '..', 'private')

function buildCandidateSlotShape(prefix) {
  const shape = {}
  for (let i = 1; i <= 3; i++) {
    shape[`${prefix}${i}`] = z.string().default('')
    shape[`${prefix}${i}k`] = z.string().default('')
    shape[`${prefix}${i}Img`] = z.string().optional()
    // タグ違いで分けた語の画像 (出典タグ → URL)。D-0039
    shape[`${prefix}${i}TagImg`] = z.record(z.string(), z.string()).optional()
  }
  return shape
}

const NumberSchema = z.object({
  num: z.string().regex(/^\d{3}$/),
  w1: z.string().default(''),
  w1k: z.string().default(''),
  w2: z.string().default(''),
  w2k: z.string().default(''),
  hito: z.string().default(''),
  mono: z.string().default(''),
  gainen: z.string().default(''),
  catScore: z.number().nullable().default(null),
  w1Score: z.number().nullable().default(null),
  w1Pattern: z.string().optional(),
  w1Error: z.union([z.boolean(), z.string()]).optional(),
  w2Score: z.number().nullable().default(null),
  w2Error: z.union([z.boolean(), z.string()]).optional(),
  w1Img: z.string().optional(),
  w2Img: z.string().optional(),
  ...buildCandidateSlotShape('wh'),
  ...buildCandidateSlotShape('wm'),
})

// 日付 (10〜12月) の 4 桁エントリ。1〜9月は numbers をそのまま使う。
// スコアは 3 桁前提なので付けない。
const DateSchema = NumberSchema.extend({
  num: z.string().regex(/^\d{4}$/),
})

const CardSchema = z.object({
  suit: z.enum(['S', 'H', 'C', 'D']),
  rank: z.string().min(1),
  person: z.string().default(''),
  actionP: z.string().default(''),
  personScore: z.number().nullable().default(null),
  object: z.string().default(''),
  actionO: z.string().default(''),
  objectScore: z.number().nullable().default(null),
  action: z.string().default(''),
  actionScore: z.number().nullable().default(null),
  personImg: z.string().optional(),
  actionImg: z.string().optional(),
  objectImg: z.string().optional(),
})

// Numbers data
const vizData = JSON.parse(
  readFileSync(join(baseDir, 'visualize-words.data.json'), 'utf8')
)
const numbers = vizData.data
  .map((d) => {
    const result = NumberSchema.safeParse(d)
    if (!result.success) {
      console.warn(`Skip number: ${d.num}`, result.error.issues[0]?.message)
      return null
    }
    return result.data
  })
  .filter(Boolean)

// Cards data
const cards = parseCardsTsv(
  readFileSync(join(baseDir, 'data', 'cards.tsv'), 'utf8'),
  (mark) => console.warn(`Skip card mark: ${mark}`)
)
  .map((raw) => {
    const result = CardSchema.safeParse(raw)
    if (!result.success) {
      console.warn(
        `Skip card: ${raw.rank}${raw.suit}`,
        result.error.issues[0]?.message
      )
      return null
    }
    return result.data
  })
  .filter(Boolean)

// --- Rules data -----------------------------------------------------------

function buildRulesData() {
  // 1桁: 0..9 ごとに core/sub/bad のかなを集める
  const singleByDigit = {}
  for (let d = 0; d <= 9; d++) {
    singleByDigit[d] = { core: [], sub: [], bad: [] }
  }
  for (const [kana, digit] of Object.entries(SINGLE_DIGIT)) {
    const tier = SINGLE_TIER[kana]
    if (tier && singleByDigit[digit]?.[tier]) {
      singleByDigit[digit][tier].push(kana)
    }
  }

  // 2桁マトリクス: matrix[row][col] = [kana, ...]
  const buildMatrix = (digitMap) => {
    const matrix = Array.from({ length: 10 }, () =>
      Array.from({ length: 10 }, () => [])
    )
    for (const [kana, digits] of Object.entries(digitMap)) {
      if (digits.length !== 2) continue
      const r = Number(digits[0])
      const c = Number(digits[1])
      if (r >= 0 && r <= 9 && c >= 0 && c <= 9) matrix[r][c].push(kana)
    }
    return matrix
  }

  return {
    singleByDigit,
    doubleMatrix: buildMatrix(DOUBLE_DIGIT),
    longMatrix: buildMatrix(LONG_DIGIT),
    weights: WEIGHTS,
  }
}

const rules = buildRulesData()

// words.tsv から予備語の補完を取り込む (新旧どちらの列名でも動く)
const wordsPath = join(baseDir, 'data', 'words.tsv')
const sub = {}
if (existsSync(wordsPath)) {
  for (const entry of loadWords('words.tsv')) {
    sub[entry.num] = { w1_2: entry.w1_2 || '', w2_2: entry.w2_2 || '' }
  }
}

// 画像 manifest (word-images.json) があれば各スロットの画像URLを merge
// (日付・カードの画像は、それぞれ読み込んだ後に同じ manifest から merge する)
const imagesPath = join(baseDir, 'data', 'word-images.json')
const images = existsSync(imagesPath)
  ? JSON.parse(readFileSync(imagesPath, 'utf8')).images || {}
  : {}
for (const n of numbers) {
  const s = sub[n.num]
  if (s) {
    if (s.w1_2) n.w1_2 = s.w1_2
    if (s.w2_2) n.w2_2 = s.w2_2
  }
  Object.assign(
    n,
    imageFieldsOf('num', images[n.num]),
    tagImagesOf(images[n.num])
  )
}
for (const c of cards)
  Object.assign(c, imageFieldsOf('card', images[cardId(c)]))

// 各番号のゴロ分類を事前計算（割り当てグラフ用）。
// t=下2桁[1,2] / h=上2桁[0,1]、1=w1k 2=w2k 3=w1_2。{ k, d } か null。
const cls = (kana, P) => {
  const g = classify(kana, P)
  return g ? { k: g.key, d: g.kind } : null
}
// 予備語はかな化できる語のみ読みにする（漢字は除外）
const kanaOf = (word) => {
  const name = extractName(word || '')
  return name && isKanaOnly(name) ? toHiragana(name) : ''
}
for (const n of numbers) {
  const s = sub[n.num] || {}
  if (s.w1_2) n.w1_2 = s.w1_2
  if (s.w2_2) n.w2_2 = s.w2_2
  const w12k = kanaOf(s.w1_2)
  const w22k = kanaOf(s.w2_2)
  n.ga = {
    t1: cls(n.w1k, [1, 2]),
    t2: cls(n.w2k, [1, 2]),
    t3: cls(w12k, [1, 2]),
    t4: cls(w22k, [1, 2]),
    h1: cls(n.w1k, [0, 1]),
    h2: cls(n.w2k, [0, 1]),
    h3: cls(w12k, [0, 1]),
    h4: cls(w22k, [0, 1]),
  }
}

// 2文字読み (拗音/長音) ごとの割当番号。読みドリルで「この読みを使う語がどれだけあるか」を出す。
const yomiUse = buildYomiUse(numbers)

// ff / kuku も私的データ。公開バンドルに焼かず、認証付き Function が返す
// この payload に載せる (未認証では 1 バイトも出さない)
const ff = JSON.parse(readFileSync(join(privateDir, 'ff.json'), 'utf8'))
const kuku = JSON.parse(readFileSync(join(privateDir, 'kuku.json'), 'utf8'))

// 日付辞書 (sync で words.tsv とは別に書き出した 4 桁行)
const datesPath = join(baseDir, 'data', 'dates.tsv')
const dates = existsSync(datesPath)
  ? loadWords('dates.tsv')
      .map((entry) => {
        const { catScore } = categoryScore(entry)
        const result = DateSchema.safeParse({ ...entry, catScore })
        if (!result.success) {
          console.warn(
            `Skip date: ${entry.num}`,
            result.error.issues[0]?.message
          )
          return null
        }
        return { ...result.data, ...imageFieldsOf('date', images[entry.num]) }
      })
      .filter(Boolean)
  : []

// タグ id → 表示名 (nr sync:tags がシートの tags タブから落とす)。詳細パネルで id ではなく名前を出すため。
// 省略表示用の short_title があればそちらを優先する (title は画像検索のクエリにも使う正式名)
const readJsonIfExists = (path) =>
  existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
const tagNames = {
  ...readJsonIfExists(join(baseDir, 'data', 'tags.json')),
  ...readJsonIfExists(join(baseDir, 'data', 'tags-short.json')),
}

// 正式名 (title) だけの表。グループ画面のタグのカードは略称ではなく正式名で出す
const tagTitles = readJsonIfExists(join(baseDir, 'data', 'tags.json'))

const out = {
  numbers,
  cards,
  rules,
  yomiUse,
  ff,
  kuku,
  dates,
  tagNames,
  tagTitles,
}
mkdirSync(privateDir, { recursive: true })
writeFileSync(join(privateDir, 'data.json'), JSON.stringify(out))
console.log(
  `Generated private/data.json (${numbers.length} numbers, ${
    dates.length
  } dates, ff ${ff.length}, kuku ${kuku.length}, ${
    cards.length
  } cards, rules: ${Object.keys(rules.singleByDigit).length} digits)`
)
