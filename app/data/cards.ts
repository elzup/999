import type { CardEntry } from './schema'
import { SUIT_LABEL } from './constants'

export function formatCardId(card: CardEntry): string {
  return `${card.rank}${SUIT_LABEL[card.suit]}`
}

type PaoItem = { type: 'P' | 'A' | 'O'; word: string; sub: string; score: number }

export function cardPao(card: CardEntry): PaoItem[] {
  const items: PaoItem[] = []
  if (card.person) items.push({ type: 'P', word: card.person, sub: card.actionP, score: card.personScore ?? 0 })
  if (card.action) items.push({ type: 'A', word: card.action, sub: '', score: (card.actionScore ?? 0) / 2 })
  if (card.object) items.push({ type: 'O', word: card.object, sub: card.actionO, score: card.objectScore ?? 0 })
  return items
}

/** PAO のうちスコア最大のものを返す。同率なら全部返す */
export function pickCardPrompt(card: CardEntry): { label: string; value: string } | null {
  const items = cardPao(card)
  if (items.length === 0) return null
  const maxScore = Math.max(...items.map((i) => i.score))
  const best = items.filter((i) => i.score === maxScore)
  return {
    label: best.map((i) => i.type).join(''),
    value: best.map((i) => formatPaoWord(i)).join(', '),
  }
}

function formatPaoWord(item: PaoItem): string {
  if (item.sub) return `${item.word}（${item.sub}）`
  return item.word
}

const PAO_LABEL: Record<string, string> = { P: 'Person', A: 'Action', O: 'Object' }

export function cardValues(card: CardEntry): [label: string, val: string, score: number][] {
  return cardPao(card)
    .sort((a, b) => b.score - a.score)
    .map((item) => [PAO_LABEL[item.type], formatPaoWord(item), item.score])
}
