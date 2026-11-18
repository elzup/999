import { describe, expect, it } from 'vitest'
import {
  migrateKanaSkipInDoc,
  migrateKanaSkipInSheet,
  skipNotationFor,
} from '../kana-skip-migrate.js'
import { rankey } from '../rankey.js'

describe('skipNotationFor', () => {
  it('自動で中間省略になるよみを、読まないかなに ( ) を付けたよみにする', () => {
    expect(skipNotationFor('さばんな', '387')).toBe('さば(ん)な')
    expect(skipNotationFor('りんご', '615')).toBe('り(ん)ご')
  })

  it('書き直しても rankey は変わらない', () => {
    for (const [kana, num] of [
      ['さばんな', '387'],
      ['りんご', '615'],
    ]) {
      expect(rankey(skipNotationFor(kana, num), num)).toBe(rankey(kana, num))
    }
  })

  it('そのまま読める・記法がもうある・空・3 桁でない番号は対象外', () => {
    expect(skipNotationFor('みかみ', '393')).toBeNull()
    expect(skipNotationFor('さば(ん)な', '387')).toBeNull()
    expect(skipNotationFor('[す]うる', '376')).toBeNull()
    expect(skipNotationFor('', '387')).toBeNull()
    expect(skipNotationFor('さばんな', '1231')).toBeNull()
  })
})

const doc = {
  num: '387',
  slots: {
    wh1: { word: 'サバンナ', kana: 'さばんな', imageUrl: 'x' },
    wm1: { word: 'サバ', kana: 'さば' },
  },
  updatedAt: 'T',
}

describe('migrateKanaSkipInDoc', () => {
  it('対象のスロットのかなだけ書き換え、他は残す', () => {
    const { next, changes } = migrateKanaSkipInDoc(doc)
    expect(changes).toEqual([
      { slot: 'wh1', word: 'サバンナ', from: 'さばんな', to: 'さば(ん)な' },
    ])
    expect(next.slots.wh1).toEqual({
      word: 'サバンナ',
      kana: 'さば(ん)な',
      imageUrl: 'x',
    })
    expect(next.slots.wm1).toBe(doc.slots.wm1)
    // 入力は書き換えない
    expect(doc.slots.wh1.kana).toBe('さばんな')
  })

  it('変えるものが無ければ null', () => {
    expect(
      migrateKanaSkipInDoc({ num: '387', slots: { wm1: doc.slots.wm1 } })
    ).toBeNull()
  })
})

describe('migrateKanaSkipInSheet', () => {
  it('見出しでかなの列を探し、変わるセルだけ返す', () => {
    const values = [
      [
        'num',
        '人',
        '物',
        'ng',
        '_',
        'wh1',
        'check',
        'wh1k',
        'rankey',
        'wm1',
        'check',
        'wm1k',
      ],
      [
        '387',
        'サバンナ',
        'サバ',
        '',
        '',
        'サバンナ',
        '',
        'さばんな',
        '',
        'サバ',
        '',
        'さば',
      ],
      ['393', 'ミカミ', '', '', '', 'ミカミ', '', 'みかみ', '', '', '', ''],
    ]
    expect(migrateKanaSkipInSheet(values)).toEqual([
      {
        cell: 'H2',
        num: '387',
        slot: 'wh1',
        before: 'さばんな',
        after: 'さば(ん)な',
      },
    ])
  })
})
