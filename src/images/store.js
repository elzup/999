// word-images 系 JSON (candidates / manifest / redo / keep) の読み書き。原子的書込 (tmp→rename)。
// 正本は Firestore imageSlots で、これらは cache (spec:image-store)。同期は image-sync.js。

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// IMAGE_DATA_DIR はテスト用 (同期のテストで本物の cache を書き換えないため)
const dataDir =
  process.env.IMAGE_DATA_DIR ||
  join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

export const PATHS = {
  candidates: join(dataDir, 'word-images.candidates.json'),
  manifest: join(dataDir, 'word-images.json'),
  redo: join(dataDir, 'word-images-redo.json'),
  keep: join(dataDir, 'word-images-keep.json'),
  // 前回 Firestore と同期した時点の文書 (image-sync.js)。差分を取る基準
  syncBase: join(dataDir, 'image-sync-base.json'),
}

export function readJson(path, fallback) {
  if (!existsSync(path)) return fallback
  try {
    return JSON.parse(readFileSync(path, 'utf-8'))
  } catch {
    return fallback
  }
}

export function writeJson(path, data) {
  const tmp = `${path}.tmp`
  writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n')
  renameSync(tmp, path)
}

export function loadCandidates() {
  return readJson(PATHS.candidates, { version: 1, items: {} })
}

export function loadManifest() {
  return readJson(PATHS.manifest, { version: 1, images: {} })
}

export function loadRedo() {
  return readJson(PATHS.redo, { version: 1, redo: {} })
}

// ロック: 気に入った画像を一括処理から保護する ("<num>:<slot>" -> true)
export function loadKeep() {
  return readJson(PATHS.keep, { version: 1, keep: {} })
}

export function isKept(keep, num, slot) {
  return Boolean(keep.keep?.[slotKey(num, slot)])
}

export const slotKey = (num, slot) => `${num}:${slot}`
