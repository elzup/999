// nr kana:long [番号の頭]
//
// よみから長音の «う» を消してしまった漢字の語の候補を一覧に出す (将棋 しょぎ → しょｳぎ)。
// 規則は kana-long.js。読むだけで何も書かない。本当に う が無い語 (所持 しょじ) も混ざるので、
// 一覧を見て直すものだけシートのかなを手で書き直す。
// 読むのはローカルの src/data/words.tsv (先に nr sync で取り直しておく)。
//
//   nr kana:long      全番号
//   nr kana:long 44   440〜449 だけ
import { collectLongVowelCandidates } from './kana-long.js'
import { SLOT_KEYS } from './sheet-layout.js'
import { loadWords } from './words.js'

const prefix = process.argv[2] ?? ''
if (prefix && !/^\d{1,3}$/.test(prefix)) {
  console.error('番号の頭は 1〜3 桁の数字で指定する (例: nr kana:long 44)')
  process.exit(1)
}

let entries
try {
  entries = loadWords()
} catch {
  console.error('src/data/words.tsv が読めない。先に nr sync で取り直す')
  process.exit(1)
}
const rows = collectLongVowelCandidates(entries, SLOT_KEYS, prefix)
for (const { num, slot, word, kana, candidates } of rows) {
  console.log(`${num} ${slot} ${word}: ${kana} → ${candidates.join(' / ')}`)
}
console.log(
  `\n${rows.length} 枠${prefix ? ` (${prefix}…)` : ''}。読むだけで書き込みはしない`
)
