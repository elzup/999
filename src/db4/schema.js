// 新しい形 (symbols / words) の文書の形。書き込み口は保存の前にこれを通す (計画 P3-1)。
// spec: .metarc/db-design-v4.md。値の中身の整合 (C1〜C9) は integrity.js が見る
import { z } from 'zod'
import { TAG_ID_RE, WORD_ID_RE } from './ids.js'
import { ATTRS, LINK_LABELS, WORD_LABELS } from './marks.js'
import { KINDS, ROLES } from './roles.js'

const wordId = z.string().regex(WORD_ID_RE)
const strings = z.array(z.string())

export const linkSchema = z
  .object({
    wordId,
    role: z.enum(Object.keys(ROLES)),
    order: z.number().int().min(0),
    kana: z.string().optional(),
    sourceAt: z.number().int().min(0).optional(),
    // その記号での当てはまり (-x 語呂強引 / -r 連想) だけ。語の性質は語へ (D-0177)
    labels: z.array(z.enum(Object.keys(LINK_LABELS))).optional(),
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
    // 語の画像 (P8)。記号ごとの画像 (link.imageUrl) が空のときに使う
    imageUrl: z.string().optional(),
    // 出典タグ (tags コレクション) の ID。出典が無い語は持たない (D-0176)
    sourceId: z.string().regex(TAG_ID_RE).optional(),
    // 語の性質: 属性 (g 概念 / i 身内) とラベル (-j 熟語 / -u 愛称 / -f お気に入り)
    attrs: z.array(z.enum(Object.keys(ATTRS))).optional(),
    labels: z.array(z.enum(Object.keys(WORD_LABELS))),
  })
  .strict()

export const tagSchema = z
  .object({
    id: z.string().regex(TAG_ID_RE),
    // 語の表記に書くコード (ｺｰﾄﾞｷﾞｱｽ など)。変えても語は書き換えない
    code: z.string().min(1),
    title: z.string(),
    short: z.string(),
    updatedAt: z.string().optional(),
  })
  .strict()

/** @returns {string[]} 形の誤り (無ければ空) */
export function shapeErrors({ symbols = [], words = [], tags = [] }) {
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
    ...tags.flatMap((t) => errorsOf(tagSchema, t, 'タグ')),
  ]
}
