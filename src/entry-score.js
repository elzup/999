// 配信データの 1 件に付くスコア (人/物の件数・本命語と対抗語の pt)。
// サーバ (app-entry.js / generate-*.js) と端末 (app の symbol ストアの出口) が同じ計算を使うため、
// node:fs を読まないこのファイルに置く (words.js は words.tsv を読むので端末に入れられない)。

import { scoreWithLabel } from './scorer.js'

/** トークン種別を短縮記号に変換 (w1Pattern 用) */
export function tokenLabel(t) {
  const labels = {
    single: 'D',
    double: 'DD',
    sokuon: 'っ',
    half: 'h',
    halfOverflow: 'H',
    overflow: 'X',
  }
  return labels[t.type] ?? '?'
}

/** 本命語 (w1) と対抗語 (w2) のスコア。generate-viz.js の buildData と同じ値を出す */
export function scoreFields(entry) {
  const out = {
    w1Score: null,
    w1Error: false,
    w1Pattern: '',
    w2Score: null,
    w2Error: false,
  }
  if (entry.w1k) {
    try {
      const s = scoreWithLabel(entry.w1k, entry.w1)
      out.w1Score = s.score
      out.w1Pattern = s.tokens.map(tokenLabel).join('+')
    } catch {
      out.w1Error = true
    }
  }
  if (entry.w2k) {
    try {
      out.w2Score = scoreWithLabel(entry.w2k, entry.w2).score
    } catch {
      out.w2Error = true
    }
  }
  return out
}

/** カンマ区切りの項目数を数える (空文字は0) */
export function countItems(str) {
  if (!str) return 0
  return str.split(',').filter((s) => s.trim() !== '').length
}

// 重みは words.js から移したまま (値は変えていない)
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
