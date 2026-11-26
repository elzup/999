// カードを直す口 (正本は DB の card:*。D-0174)。保存できたら画面の一覧へ知らせる
import type { CardEntry } from '../data/schema'

export type CardPatch = Partial<
  Pick<CardEntry, 'person' | 'actionP' | 'object' | 'actionO' | 'action'>
>

/** App が受け取って配信データのカードを差し替える (保存の後に読み直さないで済む) */
export const CARD_SAVED_EVENT = 'card:saved'

export async function patchCard(
  cardId: string,
  patch: CardPatch,
  token: string
): Promise<CardEntry> {
  const res = await fetch(`/api/cards/${cardId}`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(patch),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error ?? `保存に失敗しました (${res.status})`)
  }
  window.dispatchEvent(new CustomEvent(CARD_SAVED_EVENT, { detail: data.card }))
  return data.card
}
