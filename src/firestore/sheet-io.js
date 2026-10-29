// 双方向同期が使うシートの読み書き口。
// spec: .vsdd/firestore-store/specs/design-sheet-bisync.md
//
// 認証付きの fetch (sheetsApi) は呼び出し側が渡す。CLI は src/google-sheets.js、
// Function は Secret の鍵を使うので、ここで認証方式を決めない。
// このモジュールは Function からも読み込む。fs 依存を持ち込まないこと。

import { normalizeCell, SHEET_FIELDS } from './sheet-bisync.js'

/** 見出しの別名。古い見出し (w1k など) の行も読めるように並べる */
const HEADERS = {
  num: ['num'],
  hito: ['人', 'hito'],
  mono: ['物', 'mono'],
  wh1k: ['wh1k', 'w1k'],
  wh2k: ['wh2k'],
  wh3k: ['wh3k'],
  wm1k: ['wm1k', 'w2k'],
  wm2k: ['wm2k'],
  wm3k: ['wm3k'],
}

// batchGet は範囲を URL に並べる。1 回に詰めすぎると URL 長の上限に当たる
const RANGES_PER_REQUEST = 100

export function columnName(index) {
  let current = index
  let name = ''
  while (current > 0) {
    const remainder = (current - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    current = Math.floor((current - 1) / 26)
  }
  return name || 'A'
}

/** 見出し行から field -> 列番号 (0 始まり)。«check» など重複見出しは先勝ち */
export function columnsOf(header) {
  const firstIndex = new Map()
  header.forEach((name, i) => {
    const key = String(name ?? '').trim()
    if (!firstIndex.has(key)) firstIndex.set(key, i)
  })
  const columns = {}
  for (const [field, names] of Object.entries(HEADERS)) {
    const found = names.find((name) => firstIndex.has(name))
    if (found !== undefined) columns[field] = firstIndex.get(found)
  }
  const lacking = ['num', ...SHEET_FIELDS].filter((f) => !(f in columns))
  if (lacking.length) {
    throw new Error(`sheet_columns_missing: ${lacking.join(',')}`)
  }
  return columns
}

/** values API の行を { num, rowNumber, cells } にする。3 桁の番号の行だけ */
export function rowsOf(values) {
  const columns = columnsOf(values[0] ?? [])
  const rows = []
  values.slice(1).forEach((row, i) => {
    const num = String(row[columns.num] ?? '').trim()
    if (!/^\d{3}$/.test(num)) return
    const cells = Object.fromEntries(
      SHEET_FIELDS.map((field) => [field, row[columns[field]] ?? ''])
    )
    // 見出しが 1 行目なので、データの i 番目はシートの i + 2 行目
    rows.push({ num, rowNumber: i + 2, cells })
  })
  return { rows, columns }
}

function chunk(list, size) {
  const out = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * @param sheetsApi (path, init) => Promise<json>  /spreadsheets 以下のパスを受ける
 */
export function createSheetIo({ sheetsApi, spreadsheetId, title }) {
  let columns = null
  const a1 = (update) =>
    `${title}!${columnName(columns[update.field] + 1)}${update.rowNumber}`

  async function readCurrent(updates) {
    const current = new Map()
    for (const part of chunk(updates, RANGES_PER_REQUEST)) {
      const query = part
        .map((u) => `ranges=${encodeURIComponent(a1(u))}`)
        .join('&')
      const data = await sheetsApi(
        `/${spreadsheetId}/values:batchGet?${query}&valueRenderOption=FORMULA`
      )
      data.valueRanges?.forEach((range, i) => {
        current.set(a1(part[i]), range.values?.[0]?.[0] ?? '')
      })
    }
    return current
  }

  return {
    async readRows() {
      const data = await sheetsApi(
        `/${spreadsheetId}/values/${encodeURIComponent(title)}`
      )
      const parsed = rowsOf(data?.values ?? [])
      columns = parsed.columns
      return parsed
    },

    /**
     * 書く直前に FORMULA で読み直し、式セルと «読んだ後に人が触ったセル» を外す。
     * Sheets には CAS が無いので、これが上書き事故を防げる最後の場所。
     */
    async writeCells(updates) {
      if (!columns) throw new Error('readRows must be called first')
      const current = await readCurrent(updates)
      const skipped = []
      const writable = []
      for (const update of updates) {
        const raw = current.get(a1(update))
        if (String(raw).startsWith('=')) {
          skipped.push({ ...update, reason: 'formula' })
        } else if (normalizeCell(update.field, raw) !== update.expected) {
          skipped.push({ ...update, reason: 'changed', actual: raw })
        } else {
          writable.push(update)
        }
      }
      if (writable.length) {
        await sheetsApi(`/${spreadsheetId}/values:batchUpdate`, {
          method: 'POST',
          body: JSON.stringify({
            valueInputOption: 'RAW',
            data: writable.map((u) => ({ range: a1(u), values: [[u.value]] })),
          }),
        })
      }
      return { written: writable, skipped }
    },
  }
}

/**
 * values API は数値も文字列で返し、行末・末尾行の空セルを落とす。
 * 書こうとしている行と «同じ中身か» を比べるために同じ形へ揃える
 */
export function normalizeGrid(rows) {
  const out = (rows ?? []).map((row) => {
    const cells = row.map((cell) =>
      cell === null || cell === undefined ? '' : String(cell)
    )
    while (cells.length && cells.at(-1) === '') cells.pop()
    return cells
  })
  while (out.length && !out.at(-1).length) out.pop()
  return JSON.stringify(out)
}

/**
 * 同期の状態を別タブへ書く。データのタブには触らないので、見出しや行番号の前提
 * (columnsOf / rowsOf) を崩さない。タブが無ければ作る。
 * 中身が今と同じなら書かない (版の履歴を 5 分おきに積まない。D-0028)
 * @returns { written: boolean }
 */
export async function writeStatusTab({ sheetsApi, spreadsheetId, tab, rows }) {
  const meta = await sheetsApi(
    `/${spreadsheetId}?fields=sheets(properties(title))`
  )
  const exists = meta.sheets?.some((s) => s.properties?.title === tab)
  const range = encodeURIComponent(tab)
  if (exists) {
    const current = await sheetsApi(`/${spreadsheetId}/values/${range}`)
    if (normalizeGrid(current?.values) === normalizeGrid(rows)) {
      return { written: false }
    }
  } else {
    await sheetsApi(`/${spreadsheetId}:batchUpdate`, {
      method: 'POST',
      body: JSON.stringify({
        requests: [{ addSheet: { properties: { title: tab } } }],
      }),
    })
  }
  // 前回の衝突一覧が今回より長いと下に残るので、先に消す
  await sheetsApi(`/${spreadsheetId}/values/${range}:clear`, {
    method: 'POST',
    body: '{}',
  })
  await sheetsApi(`/${spreadsheetId}/values/${range}?valueInputOption=RAW`, {
    method: 'PUT',
    body: JSON.stringify({ values: rows }),
  })
  return { written: true }
}
