import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { score } from './scorer.js'
import {
  kataToHira,
  normalizeDakuten,
  normalizeSmallVowel,
} from './table.js'

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
    return entry
  })
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
