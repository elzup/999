// スプレッドシートの "tags" シートから tag -> title 対応を取得し
// src/data/tags.json に保存する。検索クエリのタグ展開に使う。

import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { getSheetValuesByTitle } from './google-sheets.js'

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

/**
 * 無認証 export を先に試し、非公開シートで弾かれたら認証 API に落ちる。
 * sync-sheet.js と同じ二段構え (シートを非公開にすると 401 になるため)。
 */
async function fetchRows() {
  const res = await fetch(URL)
  if (res.ok) return parseCsv(await res.text()).slice(1)

  console.log(
    `Public export unavailable (${res.status}), falling back to authenticated API...`
  )
  const values = await getSheetValuesByTitle({
    spreadsheetId: SHEET_ID,
    title: 'tags',
  })
  return values.slice(1)
}

async function main() {
  const rows = await fetchRows()

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
