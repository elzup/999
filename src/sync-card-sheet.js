import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { autoYomi } from './card-readings.js'

const SHEET_ID = '1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM'
const GID = '1530780723'
const EXPORT_URL = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=tsv&gid=${GID}`

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data')

/** スートの絵文字 → コード */
const SUIT_MAP = {
  '♠️': 'S',
  '♥️': 'H',
  '♣️': 'C',
  '♦️': 'D',
}

/** カードIDをパース: "♠️A" → { suit: "S", rank: "A" } */
function parseCardId(raw) {
  for (const [emoji, code] of Object.entries(SUIT_MAP)) {
    if (raw.startsWith(emoji)) {
      const rank = raw.slice(emoji.length).trim()
      return { suit: code, rank }
    }
  }
  return null
}

/** Google Sheet から TSV を取得 */
async function fetchSheet() {
  const url = process.env.CARD_SHEET_URL_EXPORT || EXPORT_URL
  const res = await fetch(url)

  if (!res.ok) {
    throw new Error(`Failed to fetch sheet: ${res.status} ${res.statusText}`)
  }

  const text = await res.text()

  if (text.startsWith('<!DOCTYPE')) {
    throw new Error(
      'シートが非公開です。共有設定を「リンクを知っている全員」に変更してください'
    )
  }

  return text
}

/**
 * カードシートの TSV をパース
 *
 * シート構成 (38列):
 *   col0:  card (♠️A)
 *   col1:  hito (人)
 *   col2:  hito_yomi (読み) ← 空欄
 *   col3:  hito_done (TRUE/FALSE)
 *   col4:  dousa (動作)
 *   col5:  dousa_yomi (読み) ← 空欄
 *   col6:  dousa_done
 *   col7:  mono (物)
 *   col8:  mono_yomi (読み) ← 空欄
 *   col9:  mono_done
 *   col10: card (再掲)
 *   col11: hito2 (代替人)
 *   col12: hito2_yomi ← 空欄
 *   col13: hito2_done
 *   col14: alt2
 *   col15: alt2_yomi ← 空欄
 *   col16: alt2_done
 *   col34: rank
 *   col35: best kana
 *   col36: better kana
 *   col37: bad kana
 */
function parseTsv(tsv) {
  const lines = tsv.split('\n').filter((l) => l.trim() !== '')
  const entries = []

  for (const line of lines) {
    const cols = line.split('\t')
    const cardRaw = cols[0]?.trim()
    if (!cardRaw) continue

    const parsed = parseCardId(cardRaw)
    if (!parsed) continue

    const { suit, rank } = parsed

    const hito = cols[1]?.trim() || ''
    const hitoYomi = cols[2]?.trim() || ''
    const dousa = cols[4]?.trim() || ''
    const dousaYomi = cols[5]?.trim() || ''
    const mono = cols[7]?.trim() || ''
    const monoYomi = cols[8]?.trim() || ''

    const hito2 = cols[11]?.trim() || ''
    const hito2Yomi = cols[12]?.trim() || ''
    const alt2 = cols[14]?.trim() || ''
    const alt2Yomi = cols[15]?.trim() || ''

    entries.push({
      suit,
      rank,
      hito,
      hitoYomi: hitoYomi || autoYomi(hito),
      dousa,
      dousaYomi: dousaYomi || autoYomi(dousa),
      mono,
      monoYomi: monoYomi || autoYomi(mono),
      hito2,
      hito2Yomi: hito2Yomi || autoYomi(hito2),
      alt2,
      alt2Yomi: alt2Yomi || autoYomi(alt2),
    })
  }

  return entries
}

function toTsv(entries) {
  const header =
    'suit\trank\thito\thitoYomi\tdousa\tdousaYomi\tmono\tmonoYomi\thito2\thito2Yomi\talt2\talt2Yomi'
  const rows = entries.map(
    (e) =>
      `${e.suit}\t${e.rank}\t${e.hito}\t${e.hitoYomi}\t${e.dousa}\t${e.dousaYomi}\t${e.mono}\t${e.monoYomi}\t${e.hito2}\t${e.hito2Yomi}\t${e.alt2}\t${e.alt2Yomi}`
  )
  return [header, ...rows].join('\n') + '\n'
}

async function main() {
  console.log('Fetching card sheet...')
  const tsv = await fetchSheet()

  console.log('Parsing...')
  const entries = parseTsv(tsv)

  const outPath = join(dataDir, 'cards.tsv')
  writeFileSync(outPath, toTsv(entries))
  console.log(`Saved ${entries.length} card entries to ${outPath}`)

  const stats = {
    hito: entries.filter((e) => e.hito).length,
    dousa: entries.filter((e) => e.dousa).length,
    mono: entries.filter((e) => e.mono).length,
    hitoYomi: entries.filter((e) => e.hitoYomi).length,
    dousaYomi: entries.filter((e) => e.dousaYomi).length,
    monoYomi: entries.filter((e) => e.monoYomi).length,
  }

  console.log(`  hito: ${stats.hito}/${entries.length}`)
  console.log(`  dousa: ${stats.dousa}/${entries.length}`)
  console.log(`  mono: ${stats.mono}/${entries.length}`)
  console.log(`  hitoYomi: ${stats.hitoYomi}/${entries.length}`)
  console.log(`  dousaYomi: ${stats.dousaYomi}/${entries.length}`)
  console.log(`  monoYomi: ${stats.monoYomi}/${entries.length}`)
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
