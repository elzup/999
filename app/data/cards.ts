import type { CardEntry } from './schema'
import { SUIT_LABEL } from './constants'

export function formatCardId(card: CardEntry): string {
  return `${card.rank}${SUIT_LABEL[card.suit]}`
}

export function cardValues(card: CardEntry): [label: string, val: string][] {
  return [
    ...(card.first.trim() ? [['First', card.first] as [string, string]] : []),
    ...(card.secondary.trim() ? [['Secondary', card.secondary] as [string, string]] : []),
  ]
}

export function pickCardPrompt(card: CardEntry): { label: string; value: string } | null {
  if (card.first.trim()) return { label: 'First', value: card.first }
  if (card.secondary.trim()) return { label: 'Secondary', value: card.secondary }
  return null
}
