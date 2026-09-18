// 辞書データ (numbers / cards / rules / yomiUse) の zod スキーマ 正本。
//
// 同じ形が app/data/schema.ts と src/generate-preview-data.js に二重に書かれ、
// すでに乖離していた (w1Rk が .default('') と .optional()、ga / w1_2 が片方に無い)。
// 生成する側と読む側で形がずれると、書き出した直後のデータが読めなくなる。
// ここを唯一の出所にする。
//
// 素の ESM (zod のみに依存)。node のスクリプト (src/) と vite のアプリ (app/) が
// 同じものを読む。TS 側の型は app/data/schema.ts が z.infer で取り出す。

import { z } from 'zod'

const GoroSlotSchema = z.object({ k: z.string(), d: z.string() }).nullable()

const slot = () => z.string().optional()

// 候補スロットは src/data/slots.js の SLOT_KEYS が正本だが、ここだけはキーを
// 並べて書く。ループで組むと TypeScript が個々のキーを見失い、アプリ側が
// entry.wh1 を型として引けなくなるため。
// SLOT_KEYS との一致は src/__tests__/entry-schema.test.js が縛っている。
const CANDIDATE_SLOT_SHAPE = {
  wh1: slot(),
  wh1k: slot(),
  wh1Img: slot(),
  wh2: slot(),
  wh2k: slot(),
  wh2Img: slot(),
  wh3: slot(),
  wh3k: slot(),
  wh3Img: slot(),
  wm1: slot(),
  wm1k: slot(),
  wm1Img: slot(),
  wm2: slot(),
  wm2k: slot(),
  wm2Img: slot(),
  wm3: slot(),
  wm3k: slot(),
  wm3Img: slot(),
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
  ...CANDIDATE_SLOT_SHAPE,
  ga: GoroAllocSchema.optional(),
})

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

/** かな2文字の読み → 割当先 (build:data で集計)。
 *  2文字読みの割当先。slot = 本命語(w1) / 対抗語(w2) のどちらが根拠か */
export const YomiUseHitSchema = z.object({
  num: z.string(),
  slot: z.enum(['w1', 'w2']),
})

export const YomiUseSchema = z.record(z.string(), z.array(YomiUseHitSchema))

export const AppDataSchema = z.object({
  numbers: z.array(NumberEntrySchema),
  cards: z.array(CardEntrySchema),
  rules: RulesDataSchema.optional(),
  yomiUse: YomiUseSchema.optional(),
})
