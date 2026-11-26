// 新しい形 (symbols / words) の文書の形。書き込み口は保存の前にこれを通す (計画 P3-1)。
// spec: .metarc/db-design-v4.md。値の中身の整合 (C1〜C9) は integrity.js が見る
import { z } from 'zod'
import { WORD_ID_RE } from './ids.js'
import { KINDS, ROLES } from './roles.js'

const wordId = z.string().regex(WORD_ID_RE)
const strings = z.array(z.string())

export const linkSchema = z
  .object({
    wordId,
    role: z.enum(Object.keys(ROLES)),
    order: z.number().int().min(0),
    kana: z.string().optional(),
    attrs: strings.optional(),
    sourceAt: z.number().int().min(0).optional(),
    labels: strings.optional(),
    rating: z.number().optional(),
    imageUrl: z.string().optional(),
    // 枠のその他の欄 (confirmedFor / tagImages)。P8 で語へ移すまで中身を解釈しない
    slotExtras: z.record(z.string(), z.unknown()).optional(),
    act: z.string().optional(),
    raw: z.string().optional(),
  })
  .strict()

const pickSchema = z.union([
  z.object({ wordId }).strict(),
  // 語に決まらない代表は «かな + 表記» のまま残す (refs.js)
  z.object({ k: z.string(), w: z.string() }).passthrough(),
])

export const symbolSchema = z
  .object({
    id: z.string(),
    kind: z.enum(KINDS),
    links: z.array(linkSchema),
    wordIds: z.array(wordId),
    rep: z
      .object({ picks: z.array(pickSchema), confirmed: z.boolean() })
      .passthrough()
      .optional(),
    looseRatings: z.array(z.record(z.string(), z.unknown())).optional(),
    kanaOnly: z.array(
      z.object({
        role: z.string(),
        order: z.number(),
        kana: z.string(),
        slotExtras: z.record(z.string(), z.unknown()).optional(),
      })
    ),
    extras: z.record(z.string(), z.unknown()),
    updatedAt: z.string().optional(),
    source: z.string().optional(),
  })
  .strict()

export const wordSchema = z
  .object({
    id: wordId,
    text: z.string().min(1),
    source: z.string(),
    labels: strings,
  })
  .strict()

/** @returns {string[]} 形の誤り (無ければ空) */
export function shapeErrors({ symbols = [], words = [] }) {
  const errorsOf = (schema, doc, name) => {
    const r = schema.safeParse(doc)
    return r.success
      ? []
      : r.error.issues.map(
          (i) => `${name} ${doc?.id}: ${i.path.join('.')} ${i.message}`
        )
  }
  return [
    ...symbols.flatMap((s) => errorsOf(symbolSchema, s, '記号')),
    ...words.flatMap((w) => errorsOf(wordSchema, w, '語')),
  ]
}
