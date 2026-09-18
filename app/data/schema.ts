// 辞書データのスキーマは src/data/entry-schema.js が正本 (生成する node の
// スクリプトと同じものを使う)。ここは型を取り出してアプリに配るだけ。
// アプリだけが使う localStorage 系のスキーマは下に置く。
import { z } from 'zod'

export {
  GoroAllocSchema,
  NumberEntrySchema,
  CardEntrySchema,
  TierBucketSchema,
  RulesDataSchema,
  YomiUseHitSchema,
  YomiUseSchema,
  AppDataSchema,
} from '../../src/data/entry-schema.js'

import {
  GoroAllocSchema,
  NumberEntrySchema,
  CardEntrySchema,
  RulesDataSchema,
  YomiUseHitSchema,
  YomiUseSchema,
  AppDataSchema,
} from '../../src/data/entry-schema.js'

export type GoroAlloc = z.infer<typeof GoroAllocSchema>
export type NumberEntry = z.infer<typeof NumberEntrySchema>
export type CardEntry = z.infer<typeof CardEntrySchema>
export type RulesData = z.infer<typeof RulesDataSchema>
export type YomiUseHit = z.infer<typeof YomiUseHitSchema>
export type YomiUse = z.infer<typeof YomiUseSchema>
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
