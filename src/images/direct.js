// 対象 (番号・日付・カード) の 1 枠ぶんの画像を、語から直接検索して取得する。
// 番号の一括取得は search/fetch スクリプトが受け持つが、両スクリプトは words.tsv しか
// 読まないため、日付・カードはここを通す。console と CLI (fetch-target-images) で共用する。

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PATHS,
  loadCandidates,
  loadManifest,
  writeJson,
  slotKey,
} from './store.js'
import { hashKey } from './process.js'
import { fetchFirstUsable } from './fetch-one.js'
import { uploadWebp } from './upload.js'
import { searchImages } from './search.js'
import { buildSearchWord } from './query.js'
import { buildTargets } from './targets.js'
import { parseCardsTsv } from '../cards-tsv.js'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

function readDataFile(name) {
  const path = join(dataDir, name)
  return existsSync(path) ? readFileSync(path, 'utf-8') : ''
}

function parseTsv(text) {
  const lines = text.split('\n').filter((l) => l.trim() !== '')
  if (lines.length === 0) return []
  const header = lines[0].split('\t')
  return lines.slice(1).map((line) => {
    const cols = line.split('\t')
    return Object.fromEntries(header.map((k, i) => [k, cols[i]?.trim() || '']))
  })
}

export function loadTargets() {
  const cardsTsv = readDataFile('cards.tsv')
  return buildTargets({
    words: parseTsv(readDataFile('words.tsv')),
    dates: parseTsv(readDataFile('dates.tsv')),
    cards: cardsTsv ? parseCardsTsv(cardsTsv) : [],
  })
}

// 略語タグ → 正式名 (sync:tags の出力)。番号の一括 (search-word-images) と同じ展開にする
function loadTagMap() {
  const text = readDataFile('tags.json')
  return text ? JSON.parse(text) : {}
}

export async function redoDirect({ id, slot }) {
  const word = loadTargets().find((t) => t.id === id)?.[slot]
  if (!word) return { ok: false, error: 'この枠に語が無い' }
  const current = loadManifest().images?.[id]?.[slot]
  // 今の画像は除外して別の画像を取る (番号の --redo と同じ挙動)
  const rejected = current?.sourceImageUrl ? [current.sourceImageUrl] : []
  return searchAndStore({
    id,
    slot,
    query: buildSearchWord(word, loadTagMap()),
    word,
    rejected,
  })
}

/**
 * 検索→DL→webp→アップロード→manifest 更新。
 * word を渡したときは candidates にも残す (語が後で変わったら «語変更» と出すため)。
 */
export async function searchAndStore({ id, slot, query, word, rejected = [] }) {
  try {
    const results = await searchImages(query, rejected, true)
    if (results.length === 0) return { ok: false, error: '見つからない' }
    const { result: r, webp } = await fetchFirstUsable(results)
    const { hash, key } = hashKey(webp)
    const { url } = await uploadWebp(webp, key)
    const manifest = loadManifest()
    if (!manifest.images[id]) manifest.images[id] = {}
    manifest.images[id][slot] = {
      url,
      hash,
      sourcePage: r.sourcePage || '',
      sourceImageUrl: r.imageUrl,
      uploadedAt: new Date().toISOString(),
    }
    writeJson(PATHS.manifest, manifest)
    if (word) {
      const candidates = loadCandidates()
      candidates.items = {
        ...candidates.items,
        [slotKey(id, slot)]: { word, query, status: 'ok' },
      }
      writeJson(PATHS.candidates, candidates)
    }
    return { ok: true, image: manifest.images[id][slot] }
  } catch (err) {
    return { ok: false, error: String(err.message || err).slice(0, 200) }
  }
}
