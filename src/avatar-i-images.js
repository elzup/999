// #i タグ (プライベートな友人) の枠に DiceBear miniavs アバターを割り当てる。
// 実写を Web 検索で出したくない/出すと問題な枠なので、名前を seed にした
// 決定的アバターを生成 → 400x400 webp → GCS upload → manifest 反映 → keep ロック。
//
// DiceBear の推奨 (API 直リンク) からは外れるが、共通フォーマット維持のため
// SVG をダウンロードして webp に焼き直し、他の語句画像と同じ GCS URL に揃える。
//
// 冪等: 同じ seed → 同じ webp → 同じ content-hash key なので再実行で skip。
// keep ロックにより images:search / images:retag が実写で上書きしない。

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { uploadWebp, publicUrl } from './images/upload.js'
import {
  PATHS,
  loadManifest,
  loadKeep,
  writeJson,
  slotKey,
} from './images/store.js'
import { extractName } from './words.js'

const DICEBEAR_VERSION = '10.x'
const STYLE = 'miniavs'
const IMG_SIZE = 400
const RENDER_DENSITY = 600 // viewBox 64 を十分な解像度でラスタライズしてから縮小

// 透過画像でも 999 アプリ上で見やすいよう、薄いグレー (white-gray) で flatten する。
const BG = { r: 236, g: 239, b: 241, alpha: 1 } // #eceff1
// 名札 (下部の名前ラベル)。濃い帯は見づらいので薄い白帯+濃いグレー文字。
const LABEL_BAND_H = 66
const LABEL_MAX_FONT = 50

const escapeXml = (s) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function nameLabelSvg(name) {
  const fontSize = Math.min(
    LABEL_MAX_FONT,
    Math.floor((IMG_SIZE - 40) / Math.max(name.length, 1))
  )
  const bandY = IMG_SIZE - LABEL_BAND_H
  const textY = IMG_SIZE - 22
  return Buffer.from(
    `<svg width="${IMG_SIZE}" height="${IMG_SIZE}" xmlns="http://www.w3.org/2000/svg">` +
      `<rect x="0" y="${bandY}" width="${IMG_SIZE}" height="${LABEL_BAND_H}" fill="rgba(255,255,255,0.72)"/>` +
      `<text x="${
        IMG_SIZE / 2
      }" y="${textY}" font-size="${fontSize}" font-weight="bold" ` +
      `fill="#2a2a2a" text-anchor="middle" ` +
      `font-family="Hiragino Sans, Noto Sans CJK JP, sans-serif">${escapeXml(
        name
      )}</text>` +
      `</svg>`
  )
}

const baseDir = dirname(fileURLToPath(import.meta.url))
const DATA_PATH = join(baseDir, 'visualize-words.data.json')

const hasITag = (w) => typeof w === 'string' && /#i\b/.test(w)

function collectTargets() {
  const { data } = JSON.parse(readFileSync(DATA_PATH, 'utf8'))
  const targets = []
  for (const n of data) {
    for (const slot of ['w1', 'w2']) {
      if (!hasITag(n[slot])) continue
      const seed = extractName(n[slot])
      if (!seed) continue
      targets.push({ num: n.num, slot, seed })
    }
  }
  return targets
}

function avatarUrl(seed) {
  return `https://api.dicebear.com/${DICEBEAR_VERSION}/${STYLE}/svg?seed=${encodeURIComponent(
    seed
  )}`
}

async function fetchSvg(url) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`)
  return Buffer.from(await res.arrayBuffer())
}

async function toAvatarWebp(svg, name) {
  // 透過部分を white-gray で塗り、名札を下部に合成する。
  const base = await sharp(svg, { density: RENDER_DENSITY })
    .resize(IMG_SIZE, IMG_SIZE, { fit: 'contain', background: BG })
    .flatten({ background: BG })
    .toBuffer()
  return sharp(base)
    .composite([{ input: nameLabelSvg(name), top: 0, left: 0 }])
    .webp({ quality: 82 })
    .toBuffer()
}

function hashKey(webp) {
  const hex = createHash('sha256').update(webp).digest('hex').slice(0, 20)
  return { hash: hex, key: `words/${hex}.webp` }
}

async function main() {
  const targets = collectTargets()
  const manifest = loadManifest()
  const keep = loadKeep()
  const nowIso = new Date().toISOString()

  let done = 0
  let failed = 0

  for (const { num, slot, seed } of targets) {
    const url = avatarUrl(seed)
    try {
      const svg = await fetchSvg(url)
      const webp = await toAvatarWebp(svg, seed)
      const { hash, key } = hashKey(webp)
      const { skipped } = await uploadWebp(webp, key)

      if (!manifest.images[num]) manifest.images[num] = {}
      manifest.images[num][slot] = {
        url: publicUrl(key),
        hash,
        sourcePage: `dicebear:${STYLE}`,
        sourceImageUrl: url,
        uploadedAt: nowIso,
      }
      keep.keep[slotKey(num, slot)] = true
      done++
      console.log(
        `  ${slotKey(num, slot)} "${seed}" -> ${hash}${
          skipped ? ' (upload skip)' : ''
        }`
      )
    } catch (err) {
      failed++
      console.error(`  ${slotKey(num, slot)} "${seed}" FAILED: ${err.message}`)
    }
  }

  writeJson(PATHS.manifest, manifest)
  writeJson(PATHS.keep, keep)

  console.log(`\ndone=${done} failed=${failed} (targets=${targets.length})`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
