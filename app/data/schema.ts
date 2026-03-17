import { z } from 'zod'

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
  w2Score: z.number().nullable().default(null),
  w2Error: z.union([z.boolean(), z.string()]).optional(),
})

export type NumberEntry = z.infer<typeof NumberEntrySchema>

export const CardEntrySchema = z.object({
  suit: z.enum(['S', 'H', 'C', 'D']),
  rank: z.string().min(1),
  hito: z.string().default(''),
  hitoYomi: z.string().default(''),
  dousa: z.string().default(''),
  dousaYomi: z.string().default(''),
  mono: z.string().default(''),
  monoYomi: z.string().default(''),
})

export type CardEntry = z.infer<typeof CardEntrySchema>

export const AppDataSchema = z.object({
  numbers: z.array(NumberEntrySchema),
  cards: z.array(CardEntrySchema),
})

export type AppData = z.infer<typeof AppDataSchema>

export const RecordSchema = z.object({
  date: z.string(),
  score: z.number(),
  total: z.number(),
  time: z.number(),
})

export type Record = z.infer<typeof RecordSchema>

export const YearItemSchema = z.object({
  no: z.number(),
  year: z.string(),
  event: z.string(),
  desc: z.string(),
})

export type YearItem = z.infer<typeof YearItemSchema>
