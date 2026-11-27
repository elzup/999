import { describe, expect, it } from 'vitest'
import { isCompleteRow, splitDrafts } from '../lib/editorDraft'
import type { SlotRow } from '../lib/numberDetail'

const row = (slot: string, word: string, kana: string) =>
  ({ key: slot, slot, word, kana } as SlotRow)

describe('splitDrafts', () => {
  it('語とよみが揃った枠は送り、揃っていない枠は残す', () => {
    const drafts = {
      wh1: row('wh1', 'ボブ', 'ぼぶ'),
      wh2: row('wh2', 'アリス', ''),
      wm1: row('wm1', '', 'つくえ'),
      wm2: row('wm2', '机', 'つくえ'),
    }
    const { send, keep } = splitDrafts(drafts, ['wh1', 'wh2', 'wm1'])
    expect(Object.keys(send)).toEqual(['wh1'])
    expect(Object.keys(keep)).toEqual(['wh2', 'wm1'])
  })

  it('空白だけは揃っていない扱い', () => {
    expect(isCompleteRow({ word: ' ', kana: 'あ' })).toBe(false)
    expect(isCompleteRow({ word: 'あ', kana: 'あ' })).toBe(true)
  })
})
