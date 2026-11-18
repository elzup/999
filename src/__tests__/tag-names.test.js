import { describe, it, expect } from 'vitest'
import {
  displayNamesOf,
  searchNamesOf,
  syncTagNames,
  tagNamesFromValues,
} from '../firestore/tag-names.js'

const VALUES = [
  ['tag', 'title', 'short_title', 'count'],
  ['ipra', 'アイドリープライド', 'ｱｲﾄﾞﾘｰﾌﾟﾗｲﾄﾞ', '3'],
  ['g', '概念', '', '361'],
  ['ong', '?', '', '1'],
  ['', '見出しだけ', '', ''],
]

const memoryStore = (doc = null) => {
  const writes = []
  return {
    writes,
    read: async () => doc,
    write: async (next) => {
      writes.push(next)
      doc = next
    },
  }
}

describe('tagNamesFromValues', () => {
  it('列は見出しで引く (並びが変わっても読める)', () => {
    const moved = [
      ['short_title', 'tag', 'title'],
      ['ｽﾌﾟﾗ', 'ｽﾌﾟﾗ', 'スプラトゥーン'],
    ]
    expect(tagNamesFromValues(moved)).toEqual({
      ｽﾌﾟﾗ: { title: 'スプラトゥーン', short: 'ｽﾌﾟﾗ' },
    })
  })
  it('tag が空の行は落とす', () => {
    expect(Object.keys(tagNamesFromValues(VALUES))).toEqual([
      'ipra',
      'g',
      'ong',
    ])
  })
  it('tag / title の見出しが無ければ投げる', () => {
    expect(() => tagNamesFromValues([['id', 'name']])).toThrow()
  })
})

describe('displayNamesOf', () => {
  it('short_title → title の順。title が ? なら出さない', () => {
    expect(displayNamesOf(tagNamesFromValues(VALUES))).toEqual({
      ipra: 'ｱｲﾄﾞﾘｰﾌﾟﾗｲﾄﾞ',
      g: '概念',
    })
  })
})

describe('searchNamesOf', () => {
  it('検索には正式名 (title) を使う。title が ? なら出さない (tags.json と同じ)', () => {
    expect(searchNamesOf(tagNamesFromValues(VALUES))).toEqual({
      ipra: 'アイドリープライド',
      g: '概念',
    })
  })
})

describe('syncTagNames', () => {
  const readValues = async () => VALUES
  it('変わったタグを返し、DB に書く', async () => {
    const store = memoryStore({
      names: {
        g: { title: '概念', short: '' },
        trk: { title: 'TRICKAL', short: '' },
      },
    })
    const res = await syncTagNames({ readValues, store, now: 'T' })
    expect(res.changed.sort()).toEqual(['ipra', 'ong', 'trk'].sort())
    expect(store.writes).toHaveLength(1)
    expect(store.writes[0].updatedAt).toBe('T')
  })
  it('変わっていなければ書かない', async () => {
    const store = memoryStore({ names: tagNamesFromValues(VALUES) })
    const res = await syncTagNames({ readValues, store, now: 'T' })
    expect(res.changed).toEqual([])
    expect(store.writes).toHaveLength(0)
  })
  it('apply=false なら差分だけ', async () => {
    const store = memoryStore(null)
    const res = await syncTagNames({
      readValues,
      store,
      now: 'T',
      apply: false,
    })
    expect(res.changed).toHaveLength(3)
    expect(store.writes).toHaveLength(0)
  })
})
