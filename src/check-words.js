// 語の衝突レポート。同じ語を複数の記憶対象に割り当てていないかを、
// 数字 / カード / hex をまたいで 1 つの索引で見る。
//
// これまで領域ごとに形が違って突き合わせられず、hex 側は曖昧な逆引きを
// 出題から外す (UNIQUE_READ_ROWS) ことで回避していた。src/data/memo-target.js
// の多対多索引を通せば、どの語がどの対象と競合しているかをそのまま出せる。
//
// 入力はアプリが実際に読む成果物:
//   private/data.json  (numbers / cards)  <- nr build:data
//   app/data/ff.json   (hex)              <- node scripts/gen-ff-json.mjs

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildWordIndex,
  collisions,
  targetId,
  toEntries,
} from './data/memo-target.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function readJson(path, hint) {
  try {
    return JSON.parse(readFileSync(join(root, path), 'utf8'))
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
    console.warn(`skip ${path} (${hint})`)
    return null
  }
}

const appData = readJson('private/data.json', 'run `nr build:data`')
const ff = readJson('app/data/ff.json', 'run `node scripts/gen-ff-json.mjs`')

const entries = toEntries({
  numbers: appData?.numbers ?? [],
  cards: appData?.cards ?? [],
  hex: ff ?? [],
})

if (entries.length === 0) {
  console.error('no dictionary data to check')
  process.exit(1)
}

const index = buildWordIndex(entries)
const found = collisions(index)

const kindsOf = (targets) => new Set(targets.map((t) => t.kind))
// 領域をまたぐ衝突を先に出す。同じ領域内は意図した重複のこともある
const crossKind = found.filter((c) => kindsOf(c.targets).size > 1)
const sameKind = found.filter((c) => kindsOf(c.targets).size === 1)

console.log(`語 ${index.size} / 割当 ${entries.length}`)
console.log(`衝突 ${found.length} (領域またぎ ${crossKind.length})`)

for (const [label, list] of [
  ['領域またぎ', crossKind],
  ['同一領域', sameKind],
]) {
  if (list.length === 0) continue
  console.log(`\n## ${label}`)
  for (const { label: word, targets } of list) {
    console.log(`${word}\t${targets.map(targetId).join(' ')}`)
  }
}
