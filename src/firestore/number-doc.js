// numbers/{num} ドキュメントの組み立てと検証。
// spec: .vsdd/firestore-store/specs/design-firestore-schema.md
//
// 書き込みの単位は 1 番号 1 ドキュメント。シートに無い情報 (代表語・主観評価) も
// ここに含めるので、ローカル 1 箇所にしか無い状態が解消される。
// derived (pt / rankey) はサーバ側トリガだけが書く。クライアントからは書かせない。

import { SLOT_ORDER } from '../rep-store.js'

/** Firestore のドキュメント上限 */
export const MAX_DOC_BYTES = 1024 * 1024
/** 主観評価の許容値。未評価はエントリ自体を持たない */
export const RATINGS = [-1, 0, 1, 2]
/** 最後に書いた面 */
export const SOURCES = ['sheet', 'app', 'console']
const MAX_PICKS = 2

/** words.tsv の 1 行から、値が入っているスロットだけを取り出す */
function slotsOf(word) {
  const slots = {}
  for (const slot of SLOT_ORDER) {
    const kana = (word[`${slot}k`] || '').trim()
    const label = (word[slot] || '').trim()
    if (!kana && !label) continue
    slots[slot] = {
      word: label,
      kana,
      imageUrl: (word[`${slot}Img`] || '').trim(),
    }
  }
  return slots
}

/**
 * numbers/{num} の中身を組み立てる。
 * derived は返さない (REQ-FS-005: サーバ所有)。
 */
export function buildNumberDoc({
  word,
  rep = null,
  ratings = [],
  source,
  now = new Date().toISOString(),
}) {
  return {
    num: word.num,
    hito: (word.hito || '').trim(),
    mono: (word.mono || '').trim(),
    gainen: (word.gainen || '').trim(),
    slots: slotsOf(word),
    rep,
    ratings,
    updatedAt: now,
    source,
  }
}

export function docSizeBytes(doc) {
  return Buffer.byteLength(JSON.stringify(doc))
}

/** サーバ側で受け入れる前の検証。1 つでも破れば書き込みを拒否する。 */
export function validateNumberDoc(id, doc) {
  if (!doc || typeof doc !== 'object') return { error: 'not an object' }
  if (!/^\d{3}$/.test(doc.num || '')) return { error: 'invalid num' }
  if (id !== doc.num) return { error: 'id mismatch' }
  if (!SOURCES.includes(doc.source)) return { error: 'invalid source' }

  const picks = doc.rep?.picks
  if (picks !== undefined) {
    if (!Array.isArray(picks)) return { error: 'picks must be an array' }
    if (picks.length > MAX_PICKS) return { error: 'too many picks' }
    const seen = new Set()
    for (const p of picks) {
      const key = `${p.k} ${p.w}`
      if (seen.has(key)) return { error: 'duplicate pick' }
      seen.add(key)
    }
  }

  if (doc.ratings !== undefined) {
    if (!Array.isArray(doc.ratings))
      return { error: 'ratings must be an array' }
    const seen = new Set()
    for (const r of doc.ratings) {
      if (!RATINGS.includes(r.v)) return { error: 'invalid rating' }
      const key = `${r.k} ${r.w}`
      if (seen.has(key)) return { error: 'duplicate rating' }
      seen.add(key)
    }
  }

  if (docSizeBytes(doc) >= MAX_DOC_BYTES) return { error: 'document too large' }

  return { ok: true }
}

/** クライアント (アプリ / コンソール) からの書き込みに追加で課す制約 */
export function validateClientWrite(doc) {
  if (doc && 'derived' in doc) return { error: 'derived is server-owned' }
  return { ok: true }
}
