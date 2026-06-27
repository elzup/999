import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { score } from './scorer.js'
import { kataToHira, normalizeDakuten, normalizeSmallVowel } from './table.js'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data')

export function loadWords(filename = 'words.tsv') {
  const text = readFileSync(join(dataDir, filename), 'utf-8')
  const lines = text.split('\n').filter((l) => l.trim() !== '')
  const header = lines[0].split('\t')

  return lines.slice(1).map((line) => {
    const cols = line.split('\t')
    const entry = {}
    header.forEach((key, i) => {
      entry[key] = cols[i]?.trim() || ''
    })
    return normalizeWordEntry(entry)
  })
}

const TAG_RE = /#([^\s#,]+)/g

export function parseTaggedItems(raw) {
  if (!raw) return []

  let lastBase = ''
  return String(raw)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((label) => {
      const tags = [...label.matchAll(TAG_RE)].map((match) => match[1])
      const uniqueTags = [...new Set(tags)]
      const ownBase = label.replace(TAG_RE, '').trim()
      if (ownBase) lastBase = ownBase
      const base = ownBase || lastBase
      return { label, base, tags: uniqueTags }
    })
}

export function serializeTaggedItems(items) {
  return items
    .map((item) => {
      const base = String(item?.base || '').trim()
      const tags = [...new Set(item?.tags || [])]
        .filter(Boolean)
        .map((tag) => String(tag).replace(/^#/, ''))
      return `${base}${tags.map((tag) => `#${tag}`).join('')}`.trim()
    })
    .filter(Boolean)
    .join(',')
}

function stripTag(tags, tag) {
  return tags.filter((current) => current !== tag)
}

export function splitConceptFields(monoRaw, gainenRaw = '') {
  const monoItems = parseTaggedItems(monoRaw)
  const gainenItems = parseTaggedItems(gainenRaw).map((item) => ({
    ...item,
    tags: [...new Set([...stripTag(item.tags, 'g'), 'g'])],
  }))

  return {
    mono: serializeTaggedItems([...monoItems, ...gainenItems]),
    gainen: '',
  }
}

export function mergeConceptFields(monoRaw, gainenRaw = '') {
  const monoItems = parseTaggedItems(monoRaw)
  const gainenItems = parseTaggedItems(gainenRaw).map((item) => ({
    ...item,
    tags: [...new Set([...stripTag(item.tags, 'g'), 'g'])],
  }))

  return serializeTaggedItems([...monoItems, ...gainenItems])
}

function firstString(raw, keys) {
  for (const key of keys) {
    const value = String(raw?.[key] ?? '').trim()
    if (value) return value
  }
  return ''
}

function normalizeSlotFields(raw) {
  const out = {}
  for (let i = 1; i <= 3; i++) {
    out[`wh${i}`] = firstString(raw, [
      `wh${i}`,
      i === 1 ? 'w1' : '',
      i === 2 ? 'w1_2' : '',
    ])
    out[`wh${i}k`] = firstString(raw, [`wh${i}k`, i === 1 ? 'w1k' : ''])
    out[`wh${i}Img`] = firstString(raw, [
      `wh${i}Img`,
      i === 1 ? 'w1Img' : '',
      i === 2 ? 'w1_2Img' : '',
    ])

    out[`wm${i}`] = firstString(raw, [
      `wm${i}`,
      i === 1 ? 'w2' : '',
      i === 2 ? 'w2_2' : '',
    ])
    out[`wm${i}k`] = firstString(raw, [`wm${i}k`, i === 1 ? 'w2k' : ''])
    out[`wm${i}Img`] = firstString(raw, [
      `wm${i}Img`,
      i === 1 ? 'w2Img' : '',
      i === 2 ? 'w2_2Img' : '',
    ])
  }

  out.w1 = out.wh1
  out.w1k = out.wh1k
  out.w1Img = out.wh1Img
  out.w1_2 = out.wh2
  out.w1_2Img = out.wh2Img
  out.w2 = out.wm1
  out.w2k = out.wm1k
  out.w2Img = out.wm1Img
  out.w2_2 = out.wm2
  out.w2_2Img = out.wm2Img
  return out
}

export function normalizeWordEntry(raw) {
  const concept = splitConceptFields(raw?.mono, raw?.gainen)
  return {
    ...raw,
    hito: String(raw?.hito || '').trim(),
    mono: concept.mono,
    gainen: concept.gainen,
    ...normalizeSlotFields(raw),
  }
}

/** w1/w2 から名前部分を抽出 (タグ・注釈を除去) */
export function extractName(w) {
  if (!w) return ''
  const beforeTag = w.split('#')[0].trim()
  const beforeSuffix = beforeTag.replace(/\s+-\w+$/g, '').trim()
  const beforeComma = beforeSuffix.split(',')[0].trim()
  const withoutParen = beforeComma.replace(/\([^)]*\)/g, '').trim()
  return withoutParen
}

/** ひらがな・カタカナ・長音符・中黒のみか判定 */
export function isKanaOnly(str) {
  if (!str) return false
  return /^[\u3040-\u309F\u30A0-\u30FF\u30FC\u30FB]+$/.test(str)
}

/** カタカナ混在文字列をひらがなに正規化 */
export function toHiragana(str) {
  return [...str].map((ch) => kataToHira(ch)).join('')
}

/** 比較用に正規化 (ひらがな化 + 濁音正規化 + 小文字母音正規化 + 記号除去) */
export function normalizeForCompare(str) {
  const hira = toHiragana(str)
  const noDakuten = normalizeDakuten(hira)
  const noSmall = normalizeSmallVowel(noDakuten)
  return noSmall.replace(/[・ー]/g, '')
}

/** カンマ区切りの項目数を数える (空文字は0) */
export function countItems(str) {
  if (!str) return 0
  return str.split(',').filter((s) => s.trim() !== '').length
}

const CATEGORY_WEIGHTS = { hito: 8, mono: 10, gainen: 4 }

/** 人/物/概念 のカテゴリスコアを計算 */
export function categoryScore(entry) {
  const hitoCnt = countItems(entry.hito)
  const monoCnt = countItems(entry.mono)
  const gainenCnt = countItems(entry.gainen)
  const catScore =
    hitoCnt * CATEGORY_WEIGHTS.hito +
    monoCnt * CATEGORY_WEIGHTS.mono +
    gainenCnt * CATEGORY_WEIGHTS.gainen

  return { hitoCnt, monoCnt, gainenCnt, catScore }
}

export function scoreEntry(entry) {
  const results = { num: entry.num, w1: entry.w1, w2: entry.w2 }

  if (entry.w1k) {
    try {
      const s = score(entry.w1k)
      results.w1k = entry.w1k
      results.w1Score = s.score
      results.w1Digits = s.digits
    } catch {
      results.w1k = entry.w1k
      results.w1Score = null
      results.w1Error = true
    }
  }

  if (entry.w2k) {
    try {
      const s = score(entry.w2k)
      results.w2k = entry.w2k
      results.w2Score = s.score
      results.w2Digits = s.digits
    } catch {
      results.w2k = entry.w2k
      results.w2Score = null
      results.w2Error = true
    }
  }

  return results
}
