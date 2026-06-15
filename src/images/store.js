// word-images 系 JSON (candidates / manifest / redo) の読み書き。原子的書込 (tmp→rename)。

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'data')

export const PATHS = {
  candidates: join(dataDir, 'word-images.candidates.json'),
  manifest: join(dataDir, 'word-images.json'),
  redo: join(dataDir, 'word-images-redo.json'),
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

export const slotKey = (num, slot) => `${num}:${slot}`
