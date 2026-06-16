// スプレッドシートの "tags" シートから tag -> title 対応を取得し
// src/data/tags.json に保存する。検索クエリのタグ展開に使う。

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SHEET_ID =
  process.env.SHEET_ID || '1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM'
const URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=tags`

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data')

/** 引用対応の素朴な CSV パース */
function parseCsv(text) {
  const rows = []
  let row = []
  let cur = ''
  let q = false
  for (const ch of text) {
    if (ch === '"') q = !q
    else if (ch === ',' && !q) {
      row.push(cur)
      cur = ''
    } else if (ch === '\n' && !q) {
      row.push(cur)
      rows.push(row)
      row = []
      cur = ''
    } else cur += ch
  }
  if (cur || row.length) {
    row.push(cur)
    rows.push(row)
  }
  return rows
}

async function main() {
  const res = await fetch(URL)
  if (!res.ok) throw new Error(`fetch tags sheet: ${res.status}`)
  const rows = parseCsv(await res.text()).slice(1) // header 除去

  const map = {}
  for (const r of rows) {
    const tag = (r[0] || '').trim()
    const title = (r[1] || '').trim()
    if (tag && title && title !== '?') map[tag] = title
  }

  const outPath = join(dataDir, 'tags.json')
  writeFileSync(outPath, JSON.stringify(map, null, 2) + '\n')
  console.log(`Saved ${Object.keys(map).length} tag->title to ${outPath}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
