import { describe, expect, it } from 'vitest'
import {
  ALL_SLOT_KEYS,
  CANDIDATE_DEPTH,
  CANDIDATE_PREFIXES,
  LEGACY_SLOT_SOURCE,
  PRIMARY_KEYS,
  PRIORITY_KEYS,
  SLOT_KEYS,
  slotFields,
} from '../data/slots.js'
import { NumberEntrySchema, CardEntrySchema } from '../data/entry-schema.js'
import { SLOT_KEYS as FIRESTORE_SLOT_KEYS } from '../firestore/number-doc.js'
import { DEFAULT_PRIORITY, SLOT_ORDER } from '../rep-store.js'
import { ROLES } from '../data/memo-target.js'

describe('slot definition', () => {
  it('derives the slot list from the prefixes and depth', () => {
    expect(SLOT_KEYS).toEqual(['wh1', 'wh2', 'wh3', 'wm1', 'wm2', 'wm3'])
    expect(SLOT_KEYS).toHaveLength(CANDIDATE_PREFIXES.length * CANDIDATE_DEPTH)
    expect(ALL_SLOT_KEYS).toEqual([...PRIMARY_KEYS, ...SLOT_KEYS])
  })

  it('orders the representative default across prefixes, shallowest first', () => {
    expect(PRIORITY_KEYS).toEqual(['wh1', 'wm1', 'wh2', 'wm2', 'wh3', 'wm3'])
    expect([...PRIORITY_KEYS].sort()).toEqual([...SLOT_KEYS].sort())
  })

  it('maps a slot to its TSV / JSON columns', () => {
    expect(slotFields('wh2')).toEqual({
      word: 'wh2',
      kana: 'wh2k',
      image: 'wh2Img',
    })
  })

  it('only reads back legacy columns for slots that have one', () => {
    for (const slot of Object.keys(LEGACY_SLOT_SOURCE)) {
      expect(SLOT_KEYS, `${slot} is not a slot`).toContain(slot)
    }
  })
})

// 候補を増やすときに 1 箇所だけ直して他を忘れる事故を、ここで止める。
describe('every consumer agrees with src/data/slots.js', () => {
  it('Firestore の numbers/{num} 検証', () => {
    expect(FIRESTORE_SLOT_KEYS).toEqual(SLOT_KEYS)
  })

  it('代表語コンソールの並びと既定優先順', () => {
    expect(SLOT_ORDER).toEqual(SLOT_KEYS)
    expect(DEFAULT_PRIORITY).toEqual(PRIORITY_KEYS)
  })

  it('辞書の共通モデル', () => {
    expect(ROLES.num).toEqual(ALL_SLOT_KEYS)
  })

  it('zod スキーマ (キーは明示列挙なので、ずれたらここで落ちる)', () => {
    const shape = Object.keys(NumberEntrySchema.shape)
    for (const slot of SLOT_KEYS) {
      const field = slotFields(slot)
      expect(shape, field.word).toContain(field.word)
      expect(shape, field.kana).toContain(field.kana)
      expect(shape, field.image).toContain(field.image)
    }
    // 余分なスロット列が残っていないこと
    const slotLike = shape.filter((key) => /^w[hm]\d/.test(key))
    expect(slotLike).toHaveLength(SLOT_KEYS.length * 3)
  })
})

describe('shared entry schema', () => {
  it('fills defaults and keeps optional fields absent', () => {
    const parsed = NumberEntrySchema.parse({ num: '573' })
    expect(parsed.w1).toBe('')
    expect(parsed.catScore).toBeNull()
    expect('w1Rk' in parsed).toBe(false)
    expect('wh1' in parsed).toBe(false)
  })

  it('rejects a number that is not 3 digits', () => {
    expect(NumberEntrySchema.safeParse({ num: '57' }).success).toBe(false)
  })

  it('keeps the fields that only the generator used to add', () => {
    const parsed = NumberEntrySchema.parse({
      num: '573',
      w1_2: 'ニス',
      ga: { t1: null, t2: null, h1: null, h2: null },
    })
    expect(parsed.w1_2).toBe('ニス')
    expect(parsed.ga?.t1).toBeNull()
  })

  it('validates cards', () => {
    expect(CardEntrySchema.parse({ suit: 'S', rank: 'A' }).person).toBe('')
    expect(CardEntrySchema.safeParse({ suit: 'X', rank: 'A' }).success).toBe(
      false
    )
  })
})
