// カードの読み書き (正本は DB の card:* 記号。D-0174: スプレッドシートは廃止の方向)
import { z } from 'zod'
import { toCard } from './to-legacy.js'
import {
  commitSymbolWrite,
  Db4WriteError,
  prepareSymbolWrite,
  SYMBOLS,
  WORDS,
} from './write-layer.js'

const score = z.number().min(-1).max(3).nullable()

/** アプリから直せる欄 (画像は別の口) */
export const cardPatchSchema = z
  .object({
    person: z.string(),
    actionP: z.string(),
    personScore: score,
    object: z.string(),
    actionO: z.string(),
    objectScore: score,
    action: z.string(),
    actionScore: score,
  })
  .partial()
  .strict()

export const CARD_ID_RE = /^([SHCD])(A|[2-9]|10|J|Q|K)$/

/** DB のカードを全部、配信データと同じ形で。読み取りは記号 52 + 語 */
export async function readCards(store) {
  const snap = await store.collection(SYMBOLS).where('kind', '==', 'card').get()
  const symbols = snap.docs.map((d) => ({ id: d.id, ...d.data() }))
  const ids = [...new Set(symbols.flatMap((s) => s.wordIds ?? []))]
  const wordSnaps = ids.length
    ? await store.getAll(...ids.map((id) => store.collection(WORDS).doc(id)))
    : []
  const wordsById = Object.fromEntries(
    wordSnaps
      .filter((w) => w.exists)
      .map((w) => [w.id, { id: w.id, ...w.data() }])
  )
  return symbols.map((s) => toCard(s, wordsById))
}

/**
 * カード 1 枚の欄を直す。今の値に patch を重ねて、番号と同じ保存の口 (語の ID の引き継ぎ・検査) を通す
 * @param runDb4Transaction db.js / rest.js の口 (fn(io) を 1 transaction で)
 */
export async function saveCard(runDb4Transaction, cardId, patch) {
  const match = String(cardId).match(CARD_ID_RE)
  if (!match) return { error: 'invalid_card' }
  const parsed = cardPatchSchema.safeParse(patch)
  if (!parsed.success) return { error: 'invalid_patch' }
  const [, suit, rank] = match
  try {
    return await runDb4Transaction(async (io) => {
      const plan = await prepareSymbolWrite(io, `card:${suit}${rank}`)
      const wordsById = Object.fromEntries(plan.prevWords.map((w) => [w.id, w]))
      const current = plan.prevSymbol
        ? toCard(plan.prevSymbol, wordsById)
        : { suit, rank }
      const card = { ...current, ...parsed.data }
      commitSymbolWrite(io, plan, { cards: [card] })
      return { ok: true, card }
    })
  } catch (error) {
    // 形・整合の違反なら transaction ごと止まっている (何も書いていない)
    if (error instanceof Db4WriteError)
      return { error: 'db4_invalid', problems: error.problems }
    throw error
  }
}
