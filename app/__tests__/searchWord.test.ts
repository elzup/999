import { describe, expect, it } from 'vitest'
import { buildSearchWord } from '../lib/searchWord'
// @ts-expect-error JS のモジュール (型なし)
import { buildSearchWord as serverBuild } from '../../src/images/query.js'

const TAGS = { pr: 'プリコネ', res: 'アトリエ', tri: 'トリッカル' }

describe('buildSearchWord (画面)', () => {
  it.each([
    'ミミ#pr -a',
    'マオ#コードギアス',
    '麻衣(先輩),まい',
    '四季(真賀田)',
    'ハブ#ｳｼｼﾞﾏ',
    'ロロナ#res#pr -x',
    'エリカ#tri',
    'A -n',
    '',
    'x(y)#res,z',
  ])('サーバと同じ検索ワードになる: %s', (word) => {
    expect(buildSearchWord(word, TAGS)).toBe(serverBuild(word, TAGS))
  })

  it('略語タグを正式名に展開する', () => {
    expect(buildSearchWord('エリカ#tri', TAGS)).toBe('エリカ トリッカル')
  })
})
