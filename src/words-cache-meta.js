// PC 側キャッシュ (src/data/words.tsv) の指紋と «内容の最終更新»。
// nr sync は内容が同じでも words.tsv を書き直すので mtime は内容の更新時刻にならない。
// 指紋が変わったときだけ contentUpdatedAt を進め、別ファイルに持つ (D-0027)

import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { fingerprint } from './firestore/fingerprint.js'
import { sheetFormOfRow } from './firestore/sheet-bisync.js'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data')
export const WORDS_META_PATH = join(dataDir, 'words.meta.json')

/** words.tsv の行 (num, hito, mono, wh1k, ...) から指紋を作る */
export function fingerprintOfEntries(entries) {
  return fingerprint(
    Object.fromEntries(entries.map((e) => [e.num, sheetFormOfRow(e)]))
  )
}

export function readWordsMeta() {
  if (!existsSync(WORDS_META_PATH)) return null
  return JSON.parse(readFileSync(WORDS_META_PATH, 'utf-8'))
}

export function writeWordsMeta(entries, now = new Date().toISOString()) {
  const prev = readWordsMeta()
  const fp = fingerprintOfEntries(entries)
  const meta = {
    fingerprint: fp,
    contentUpdatedAt:
      prev?.fingerprint === fp ? prev.contentUpdatedAt ?? now : now,
    syncedAt: now,
  }
  writeFileSync(WORDS_META_PATH, JSON.stringify(meta, null, 2) + '\n')
  return meta
}
