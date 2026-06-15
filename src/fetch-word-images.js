// 決定的な画像取得パイプライン (機械処理ステップ)。
// candidates.json (エージェントが見つけた imageUrl) を読み、
// download → 400x400 webp → content-hash → GCS upload → manifest 書込。
// 冪等: manifest 既存 & redo 無しは skip。失敗は candidates に status:error を記録し継続。

import { downloadImage } from './images/download.js'
import { toWebp, hashKey } from './images/process.js'
import { uploadWebp } from './images/upload.js'
import {
  PATHS,
  loadCandidates,
  loadManifest,
  loadRedo,
  writeJson,
  slotKey,
} from './images/store.js'

const REDO_ONLY = process.argv.includes('--redo-only')

function nowIso() {
  return new Date().toISOString()
}

async function processItem(item, manifest) {
  const { num, slot, imageUrl } = item
  const { buffer } = await downloadImage(imageUrl)
  const webp = await toWebp(buffer)
  const { hash, key } = hashKey(webp)
  const { url, skipped } = await uploadWebp(webp, key)

  if (!manifest.images[num]) manifest.images[num] = {}
  manifest.images[num][slot] = {
    url,
    hash,
    sourcePage: item.sourcePage || '',
    sourceImageUrl: imageUrl,
    uploadedAt: nowIso(),
  }
  return { hash, skipped }
}

async function main() {
  const candidates = loadCandidates()
  const manifest = loadManifest()
  const redo = loadRedo()

  const items = Object.values(candidates.items || {})
  let done = 0
  let failed = 0
  let skipped = 0

  for (const item of items) {
    const key = slotKey(item.num, item.slot)
    const flaggedRedo = Boolean(redo.redo?.[key])

    if (REDO_ONLY && !flaggedRedo) continue
    if (item.status !== 'found' || !item.imageUrl) continue

    const alreadyDone = Boolean(manifest.images?.[item.num]?.[item.slot])
    if (alreadyDone && !flaggedRedo) {
      skipped++
      continue
    }

    try {
      const { hash, skipped: up } = await processItem(item, manifest)
      done++
      if (flaggedRedo) delete redo.redo[key]
      console.log(`  ${key} -> ${hash}${up ? ' (upload skip)' : ''}`)
    } catch (err) {
      failed++
      item.status = 'error'
      item.error = err.message
      console.error(`  ${key} FAILED: ${err.message}`)
    }
  }

  writeJson(PATHS.manifest, manifest)
  writeJson(PATHS.candidates, candidates)
  writeJson(PATHS.redo, redo)

  console.log(
    `\ndone=${done} skipped=${skipped} failed=${failed} (mode=${
      REDO_ONLY ? 'redo-only' : 'all'
    })`
  )
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
