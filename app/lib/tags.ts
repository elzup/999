import type { NumberEntry } from '../data/schema'

export type NumberTagCategory = 'hito' | 'mono' | 'gainen'

export type TaggedItem = {
  label: string
  base: string
  tags: string[]
}

export type TagOccurrence = {
  num: string
  category: NumberTagCategory
  value: string
  base: string
}

export type NumberTagSummary = {
  tag: string
  count: number
  categories: Record<NumberTagCategory, number>
  nums: string[]
  occurrences: TagOccurrence[]
}

const TAG_RE = /#([^\s#,]+)/g

export function parseTaggedItems(raw: string): TaggedItem[] {
  if (!raw) return []

  return raw
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((label) => {
      const tags = [...label.matchAll(TAG_RE)].map((match) => match[1])
      const uniqueTags = [...new Set(tags)]
      const base = label.replace(TAG_RE, '').trim()
      return { label, base, tags: uniqueTags }
    })
}

export function collectNumberTags(numbers: NumberEntry[]): NumberTagSummary[] {
  const map = new Map<string, NumberTagSummary>()

  for (const number of numbers) {
    const fields: Array<[NumberTagCategory, string]> = [
      ['hito', number.hito],
      ['mono', number.mono],
      ['gainen', number.gainen],
    ]

    for (const [category, raw] of fields) {
      for (const item of parseTaggedItems(raw)) {
        for (const tag of item.tags) {
          const existing = map.get(tag) || {
            tag,
            count: 0,
            categories: { hito: 0, mono: 0, gainen: 0 },
            nums: [],
            occurrences: [],
          }

          existing.count += 1
          existing.categories[category] += 1
          existing.occurrences.push({
            num: number.num,
            category,
            value: item.label,
            base: item.base,
          })
          if (!existing.nums.includes(number.num)) {
            existing.nums.push(number.num)
          }

          map.set(tag, existing)
        }
      }
    }
  }

  return [...map.values()].sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.tag.localeCompare(b.tag, 'ja')
  })
}
