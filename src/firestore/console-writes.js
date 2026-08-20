// コンソールからの部分更新。
// spec: .vsdd/firestore-store/specs/spec-console-writes.md
//
// 代表語 (rep) と主観評価 (ratings) は独立した軸で、片方の更新が他方を変えない。
// 全文書を組み立てて上書きする形にすると、片方を書いたつもりで他方を消せてしまう
// (実際に word-rep.json の運用でそれを起こしている)。
// ここでは «現在の文書に対して 1 フィールドだけ差し替えた文書» を作り、
// writeNumber の assertPreserves で落ちないことを保証する。

import { RATINGS } from './number-doc.js'
import { writeNumber } from './write.js'

const valueOf = (entry) => ({
  k: String(entry?.k ?? '').normalize('NFC'),
  w: String(entry?.w ?? '').normalize('NFC'),
})
const sameValue = (a, b) => {
  const x = valueOf(a)
  const y = valueOf(b)
  return x.k === y.k && x.w === y.w
}

/** 現在の文書を土台に、指定フィールドだけ差し替える */
function patch(current, field, value, { now, source = 'console' }) {
  if (!current) return { error: 'unknown num' }
  const next = { ...current, [field]: value, updatedAt: now, source }
  delete next.derived // サーバ所有。writeNumber が付け直す
  return { doc: next }
}

/**
 * 代表語を保存する。ratings には触れない (REQ-CON-001)。
 */
export async function saveRep(db, { num, picks, confirmed, current, now }) {
  const built = patch(current, 'rep', { picks, confirmed }, { now })
  if (built.error) return built
  return writeNumber(db, {
    num,
    doc: built.doc,
    expectedUpdatedAt: current.updatedAt ?? null,
    intent: ['rep'],
  })
}

/**
 * 主観評価を 1 件保存する。rep と確定状態には触れない (REQ-CON-002)。
 * v が null なら該当エントリを削除する。0 として保存しない (REQ-CON-003)。
 */
export async function saveRating(db, { num, k, w, v, current, now }) {
  if (v !== null && !RATINGS.includes(v)) return { error: 'invalid rating' }
  if (!current) return { error: 'unknown num' }

  const kept = (current.ratings ?? []).filter((r) => !sameValue(r, { k, w }))
  const next = v === null ? kept : [...kept, { ...valueOf({ k, w }), v }]

  const built = patch(current, 'ratings', next, { now })
  if (built.error) return built
  return writeNumber(db, {
    num,
    doc: built.doc,
    expectedUpdatedAt: current.updatedAt ?? null,
    intent: ['ratings'],
  })
}

/**
 * 画像を確定する。確定時点の語を併せて残す (REQ-CON-004)。
 * これが無いと、sync で語が差し替わっても確定が外れず、前の語で取った画像が残る。
 */
export async function confirmImage(db, { num, slot, imageUrl, current, now }) {
  if (!current) return { error: 'unknown num' }
  const slotNow = current.slots?.[slot]
  if (!slotNow) return { error: `unknown slot: ${slot}` }

  const slots = {
    ...current.slots,
    [slot]: { ...slotNow, imageUrl, confirmedFor: slotNow.word },
  }
  const built = patch(current, 'slots', slots, { now })
  if (built.error) return built
  return writeNumber(db, {
    num,
    doc: built.doc,
    expectedUpdatedAt: current.updatedAt ?? null,
    intent: ['slots'],
  })
}

/**
 * 確定時点の語と現在の語がずれているスロットを返す (REQ-CON-005)。
 * タグが付いただけ (嫌 -> 嫌#g) は無視し、本体が別語になったものだけを拾う。
 */
export function staleImages(doc) {
  const stale = []
  for (const [slot, value] of Object.entries(doc.slots ?? {})) {
    const confirmedFor = value?.confirmedFor
    if (!confirmedFor || !value.imageUrl) continue
    if (nameOf(confirmedFor) !== nameOf(value.word)) {
      stale.push({ slot, confirmedFor, now: value.word })
    }
  }
  return stale
}

/** 語からタグ・ラベル・別名・括弧注記を落とした本体 (words.js#extractName と同じ規則) */
export function nameOf(word) {
  if (!word) return ''
  return word
    .split('#')[0]
    .replace(/\s*-\w+\s*$/, '')
    .split(',')[0]
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '')
    .trim()
}
