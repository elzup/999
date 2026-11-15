import { describe, expect, it } from 'vitest'
import * as node from '../rule-tsv.js'
import * as browser from '../rule-tsv.browser.js'

// アプリは vite の alias で browser 版を読む。両方が同じ規則表を渡さないと、
// アプリの rankey だけが Function・コンソールとずれる
describe('rule-tsv', () => {
  it('node 版とブラウザ版が同じ規則表を渡す', () => {
    expect(browser).toEqual(node)
    expect(node.SINGLE_DIGIT_TSV.length).toBeGreaterThan(0)
  })
})
