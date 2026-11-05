// rankey の型ごとの統計と、拗音4省略 (~) を使っている語の一覧。
// `nr stats:rankey` で docs/rankey-stats.md を再生成する。
// 集計そのもの (collectRankeyStats) は純粋関数で、ダッシュボード (generate-viz) も使う。

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { rankey } from './rankey.js'

export const RANKEY_SLOTS = ['wh1', 'wh2', 'wh3', 'wm1', 'wm2', 'wm3']
const EXAMPLES_PER_TYPE = 3

/** rankey の本体 (| の前) */
export function rankeyBody(rk) {
  return String(rk || '').split('|')[0]
}

/**
 * 全スロットの rankey を数える。
 * - byBody: 本体 (3桁の内訳) ごとの件数と語例
 * - byKey : rankey 全体 (接尾込み) ごとの件数
 * - youon4: ~ を含む語。kind は読みで落としたか (reading) 語の側で落としたか (word)
 */
export function collectRankeyStats(entries, slots = RANKEY_SLOTS) {
  const byBody = {}
  const byKey = {}
  const youon4 = []
  let total = 0
  let unreadable = 0

  for (const entry of entries) {
    for (const slot of slots) {
      const kana = (entry[`${slot}k`] || '').trim()
      if (!kana) continue
      const word = entry[slot] || ''
      const rk = rankey(kana, entry.num, word)
      total++
      if (rk === null) {
        unreadable++
        continue
      }
      const body = rankeyBody(rk)
      const b = (byBody[body] ??= { count: 0, examples: [] })
      b.count++
      if (b.examples.length < EXAMPLES_PER_TYPE) {
        b.examples.push({ num: entry.num, slot, word, kana })
      }
      byKey[rk] = (byKey[rk] ?? 0) + 1

      if (body.includes('~')) {
        youon4.push({
          num: entry.num,
          slot,
          word,
          kana,
          rk,
          // 読みに う/ん が残っていれば読みで落としている
          kind: /[ゃゅょャュョ][うんウン]/.test(kana) ? 'reading' : 'word',
        })
      }
    }
  }

  const sortDesc = (obj) =>
    Object.entries(obj).sort(
      (a, b) => b[1].count - a[1].count || (a[0] < b[0] ? -1 : 1)
    )
  return {
    total,
    unreadable,
    byBody: sortDesc(byBody).map(([body, v]) => ({ body, ...v })),
    byKey: Object.entries(byKey)
      .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
      .map(([key, count]) => ({ key, count })),
    youon4: youon4.sort((a, b) => (a.num < b.num ? -1 : a.num > b.num ? 1 : 0)),
  }
}

const KIND_LABEL = { reading: '読みで落とす', word: '語の側で落とす' }

export function renderRankeyStatsMarkdown(stats) {
  const pct = (n) =>
    stats.total ? ((n / stats.total) * 100).toFixed(1) : '0.0'
  // 表のセル内の | は列区切りになるのでエスケープする
  const code = (rk) => `\`${rk.replace(/\|/g, '\\|')}\``
  const ex = (e) => `${e.num} ${e.word || e.kana}(${e.kana})`
  const lines = [
    '# rankey 統計',
    '',
    '`src/data/words.tsv` の全スロット (wh1-3 / wm1-3) の rankey を集計したもの。`nr stats:rankey` で再生成。',
    '記号の意味は `src/rankey.js` の冒頭を参照。',
    '',
    `- 対象: ${stats.total} 語 (読めない読み: ${stats.unreadable})`,
    `- 拗音4省略 (~): ${stats.youon4.length} 語`,
    '',
    '## 本体 (3桁の内訳) ごと',
    '',
    '| 本体 | 件数 | 割合 | 語例 |',
    '| ---- | ---: | ---: | ---- |',
    ...stats.byBody.map(
      (b) =>
        `| \`${b.body}\` | ${b.count} | ${pct(b.count)}% | ${b.examples.map(ex).join(' / ')} |`
    ),
    '',
    '## 拗音4省略 (~) の語',
    '',
    '読みで落とす = 読みに う/ん を残して拗音4ルールで読む (例: びょうに)。',
    '語の側で落とす = 読みからは落とし、語にだけ残っている (例: 読み びょに / 語 びょうにん)。',
    '',
    '| 番号 | 枠 | 語 | 読み | rankey | 種別 |',
    '| ---- | -- | -- | ---- | ------ | ---- |',
    ...stats.youon4.map(
      (y) =>
        `| ${y.num} | ${y.slot} | ${y.word} | ${y.kana} | ${code(y.rk)} | ${KIND_LABEL[y.kind]} |`
    ),
    '',
    '## rankey 全体 (接尾込み) ごと',
    '',
    '| rankey | 件数 |',
    '| ------ | ---: |',
    ...stats.byKey.map((k) => `| ${code(k.key)} | ${k.count} |`),
    '',
  ]
  return lines.join('\n')
}

async function main() {
  const { loadWords } = await import('./words.js')
  const file = process.argv[2] || 'words.tsv'
  const stats = collectRankeyStats(loadWords(file))
  const out = join(
    dirname(fileURLToPath(import.meta.url)),
    '..',
    'docs',
    'rankey-stats.md'
  )
  writeFileSync(out, renderRankeyStatsMarkdown(stats))
  console.log(
    `rankey: ${stats.total} 語 / 型 ${stats.byBody.length} 種 / 拗音4省略 ${stats.youon4.length} 語`
  )
  for (const y of stats.youon4) {
    console.log(
      `  ${y.num} ${y.slot} ${y.word} (${y.kana}) ${y.rk} ${KIND_LABEL[y.kind]}`
    )
  }
  console.log(`-> ${out}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main()
