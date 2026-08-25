import { z } from 'zod'

const GoroSlotSchema = z.object({ k: z.string(), d: z.string() }).nullable()

const CandidateSlotSchema = {
  word: z.string().optional(),
  kana: z.string().optional(),
  image: z.string().optional(),
}

type CandidateRank = 1 | 2 | 3
type CandidateSlotShape<Prefix extends 'wh' | 'wm'> = {
  [Key in `${Prefix}${CandidateRank}`]: typeof CandidateSlotSchema.word
} & {
  [Key in `${Prefix}${CandidateRank}k`]: typeof CandidateSlotSchema.kana
} & {
  [Key in `${Prefix}${CandidateRank}Img`]: typeof CandidateSlotSchema.image
}

function buildCandidateSlotShape<Prefix extends 'wh' | 'wm'>(
  prefix: Prefix
): CandidateSlotShape<Prefix> {
  return {
    [`${prefix}1`]: CandidateSlotSchema.word,
    [`${prefix}1k`]: CandidateSlotSchema.kana,
    [`${prefix}1Img`]: CandidateSlotSchema.image,
    [`${prefix}2`]: CandidateSlotSchema.word,
    [`${prefix}2k`]: CandidateSlotSchema.kana,
    [`${prefix}2Img`]: CandidateSlotSchema.image,
    [`${prefix}3`]: CandidateSlotSchema.word,
    [`${prefix}3k`]: CandidateSlotSchema.kana,
    [`${prefix}3Img`]: CandidateSlotSchema.image,
  } as CandidateSlotShape<Prefix>
}

export const GoroAllocSchema = z.object({
  t1: GoroSlotSchema,
  t2: GoroSlotSchema,
  t3: GoroSlotSchema.optional(),
  t4: GoroSlotSchema.optional(),
  h1: GoroSlotSchema,
  h2: GoroSlotSchema,
  h3: GoroSlotSchema.optional(),
  h4: GoroSlotSchema.optional(),
})

export type GoroAlloc = z.infer<typeof GoroAllocSchema>

export const NumberEntrySchema = z.object({
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
  // rankey: 3桁の内訳記法。編集画面でだけ出す (学習中は邪魔なので)
  w1Rk: z.string().optional(),
  w2Score: z.number().nullable().default(null),
  w2Error: z.union([z.boolean(), z.string()]).optional(),
  w2Rk: z.string().optional(),
  w1Img: z.string().optional(),
  w2Img: z.string().optional(),
  w1_2: z.string().optional(),
  w2_2: z.string().optional(),
  w1_2Img: z.string().optional(),
  w2_2Img: z.string().optional(),
  ...buildCandidateSlotShape('wh'),
  ...buildCandidateSlotShape('wm'),
  ga: GoroAllocSchema.optional(),
})

export type NumberEntry = z.infer<typeof NumberEntrySchema>

export const CardEntrySchema = z.object({
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
})

export type CardEntry = z.infer<typeof CardEntrySchema>

export const TierBucketSchema = z.object({
  core: z.array(z.string()).default([]),
  sub: z.array(z.string()).default([]),
  bad: z.array(z.string()).default([]),
})

export const RulesDataSchema = z.object({
  singleByDigit: z.record(z.string(), TierBucketSchema),
  doubleMatrix: z.array(z.array(z.array(z.string()))),
  longMatrix: z.array(z.array(z.array(z.string()))),
  weights: z.record(z.string(), z.number()),
})

export type RulesData = z.infer<typeof RulesDataSchema>

/** かな2文字の読み → その読みを割り当てている番号 (build:data で集計) */
export const YomiUseSchema = z.record(z.string(), z.array(z.string()))

export type YomiUse = z.infer<typeof YomiUseSchema>

export const AppDataSchema = z.object({
  numbers: z.array(NumberEntrySchema),
  cards: z.array(CardEntrySchema),
  rules: RulesDataSchema.optional(),
  yomiUse: YomiUseSchema.optional(),
})

export type AppData = z.infer<typeof AppDataSchema>

export const RecordSchema = z.object({
  date: z.string(),
  score: z.number(),
  total: z.number(),
  time: z.number(),
  mode: z.enum(['check', 'train']).optional(),
})

export type Record = z.infer<typeof RecordSchema>

export const CardStatSchema = z.object({
  attempts: z.number().default(0),
  wrong: z.number().default(0),
  totalTime: z.number().default(0),
})

export type CardStat = z.infer<typeof CardStatSchema>

export const CardStatsSchema = z.record(z.string(), CardStatSchema)

export type CardStats = z.infer<typeof CardStatsSchema>

export const CardTrainSettingsSchema = z.object({
  groupSize: z.union([z.literal(2), z.literal(3), z.literal(4)]).default(2),
  direction: z.enum(['right', 'left']).default('right'),
})

export type CardTrainSettings = z.infer<typeof CardTrainSettingsSchema>

export const YearItemSchema = z.object({
  no: z.number(),
  year: z.string(),
  event: z.string(),
  desc: z.string(),
})

export type YearItem = z.infer<typeof YearItemSchema>
