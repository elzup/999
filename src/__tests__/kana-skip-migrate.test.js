import { describe, expect, it } from 'vitest'
import {
  migrateKanaSkipInDoc,
  migrateKanaSkipInSheet,
  restoreSkipFor,
  skipNotationFor,
  skipRewriteFor,
  tailSkipFor,
} from '../kana-skip-migrate.js'
import { rankey } from '../rankey.js'
import { score } from '../scorer.js'

describe('skipNotationFor', () => {
  it('自動で中間省略になるよみを、読まないかなに ( ) を付けたよみにする', () => {
    expect(skipNotationFor('さばんな', '387')).toBe('さばﾝな')
    expect(skipNotationFor('りんご', '615')).toBe('りﾝご')
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
    expect(skipNotationFor('さばﾝな', '387')).toBeNull()
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
      {
        slot: 'wh1',
        kind: 'middle',
        word: 'サバンナ',
        from: 'さばんな',
        to: 'さばﾝな',
      },
    ])
    expect(next.slots.wh1).toEqual({
      word: 'サバンナ',
      kana: 'さばﾝな',
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
        kind: 'middle',
        before: 'さばんな',
        after: 'さばﾝな',
      },
    ])
  })
})

describe('tailSkipFor (語尾)', () => {
  it('3 桁を超えて読まない語尾を ( ) で囲む。rankey は変わらない', () => {
    expect(tailSkipFor('にいさん', '223')).toBe('にいさﾝ')
    expect(rankey('にいさﾝ', '223')).toBe(rankey('にいさん', '223'))
  })

  it('語尾が 3 桁に収まっているよみは対象外', () => {
    expect(tailSkipFor('みかみ', '393')).toBeNull()
  })
})

describe('restoreSkipFor (よみから消してあるかな)', () => {
  it('かなだけの語と突き合わせ、消してあるかなを ( ) で戻す', () => {
    expect(restoreSkipFor('サバンナ', 'さばな', '387')).toBe('さばﾝな')
    expect(restoreSkipFor('ミッキー', 'みっき', '391')).toBe('みっきｰ')
    // タグ・ラベルは語から外して突き合わせる
    expect(restoreSkipFor('サバンナ#g -a', 'さばな', '387')).toBe('さばﾝな')
  })

  it('読む数字は変わらない', () => {
    expect(score('さばﾝな').digits).toBe(score('さばな').digits)
  })

  it('3 文字以上続けて消してあるかなは ( ) 2 文字ずつに分ける', () => {
    expect(restoreSkipFor('アイウエオ', 'あお', '07')).toBeNull() // 番号が 3 桁でない
    const restored = restoreSkipFor('サバンナンナ', 'さばな', '387')
    expect(restored).toBe('さばﾝなﾝﾅ')
  })

  it('漢字の語・よみに語に無い字がある・同じよみは対象外', () => {
    expect(restoreSkipFor('麻衣', 'まい', '070')).toBeNull()
    expect(restoreSkipFor('サバンナ', 'さばの', '387')).toBeNull()
    expect(restoreSkipFor('サバンナ', 'さばんな', '387')).toBeNull()
  })
})

describe('skipRewriteFor', () => {
  it('語と突き合わせる restore を先に、無ければ middle、tail の順に見る', () => {
    expect(skipRewriteFor('サバンナ', 'さばな', '387')).toEqual({
      kind: 'restore',
      to: 'さばﾝな',
    })
    expect(skipRewriteFor('サバンナ', 'さばんな', '387')).toEqual({
      kind: 'middle',
      to: 'さばﾝな',
    })
    expect(skipRewriteFor('', 'にいさん', '223')).toEqual({
      kind: 'tail',
      to: 'にいさﾝ',
    })
    expect(skipRewriteFor('ミカミ', 'みかみ', '393')).toBeNull()
  })
})
