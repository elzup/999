// シート -> DB の片方向同期。書き込みプランを組み立てるだけで、
// Firestore には触らない (テスト可能にするため)。
// spec: .vsdd/firestore-store/specs/spec-sheet-to-db-sync.md
//
// 最重要の不変条件は「DB 側にしか無い情報 (rep / ratings / imageUrl) を消さない」。
// これは nr push が 21 列で全上書きして rankey/check を消している事故の裏返し。

import { assertPreserves, buildNumberDoc, canonicalJson } from './number-doc.js'

/** シート由来で更新してよいフィールド */
const SHEET_OWNED = ['hito', 'mono', 'gainen']
/** スロットのうちシートが所有するのは語とかなだけ。画像は画像パイプライン側 */
const SHEET_OWNED_SLOT_FIELDS = ['word', 'kana']

/**
 * スロットをマージする。
 * シート行に無いスロットも DB 側に残っていれば保持する (和集合)。
 * これをしないと、かなを消した行が DB の imageUrl ごと吹き飛ばす。
 */
function mergeSlots(fromSheet, current = {}) {
  const merged = {}
  for (const slot of new Set([
    ...Object.keys(current),
    ...Object.keys(fromSheet),
  ])) {
    const next = fromSheet[slot]
    const prev = current[slot]
    if (!next) {
      merged[slot] = prev // シートが触れていないスロットはそのまま
      continue
    }
    merged[slot] = {
      ...prev,
      ...Object.fromEntries(
        SHEET_OWNED_SLOT_FIELDS.map((field) => [field, next[field]])
      ),
      // 画像 URL はシートにも列があるが古い写しでしかない。DB の値を正とする
      imageUrl: prev?.imageUrl ?? next.imageUrl ?? '',
    }
  }
  return merged
}

/**
 * 書き込みが要るかを判定する。
 * Firestore はマップのフィールドをソートして返すため、JSON.stringify で
 * 比較すると往復しただけで «変わった» と誤判定し、毎回 1000 件書き直す。
 */
function isUnchanged(next, current) {
  if (!current) return false
  if (canonicalJson(next.slots) !== canonicalJson(current.slots)) return false
  return SHEET_OWNED.every((key) => (next[key] || '') === (current[key] || ''))
}

/** Sheets API は数値セルを Number で返すことがある。中断せず文字列にする */
function numOf(row) {
  const raw = row?.num
  if (raw === null || raw === undefined) return ''
  return String(raw).trim()
}

/**
 * @param rows       シートの行 (words.tsv と同じ形)
 * @param existing   既存の numbers ドキュメント { [num]: doc }
 * @param withDerived derived を付ける関数 (呼び出し側が注入する)
 * @returns { writes, deletes, kept, unchanged, ignored, conflicts, refused }
 */
export function planSheetSync({ rows, existing = {}, now, withDerived }) {
  const writes = []
  const conflicts = []
  const refused = []
  const seen = new Map()
  let unchanged = 0
  let ignored = 0

  for (const row of rows) {
    const num = numOf(row)
    if (!/^\d{3}$/.test(num)) {
      ignored++
      continue
    }
    // 同じ num が複数行あると、後勝ちで片方が黙って消える。書かずに報告する
    if (seen.has(num)) {
      conflicts.push(num)
      continue
    }
    seen.set(num, true)

    const current = existing[num]
    const fresh = buildNumberDoc({
      word: { ...row, num },
      // DB 側にしか無い情報。既存があればそのまま引き継ぐ
      rep: current?.rep,
      ratings: current?.ratings,
      source: 'sheet',
      now,
    })
    const doc = { ...fresh, slots: mergeSlots(fresh.slots, current?.slots) }

    if (isUnchanged(doc, current)) {
      unchanged++
      continue
    }

    // 保護対象を落としていないか、書く直前に必ず確かめる
    const preserved = assertPreserves(current, doc)
    if (preserved.error) {
      refused.push({ num, error: preserved.error })
      continue
    }

    writes.push({
      num,
      doc: withDerived ? withDerived(doc) : doc,
      // 適用時の競合検出用。読んだ時点の値と違えば他の面が書いている
      expectedUpdatedAt: current?.updatedAt ?? null,
    })
  }

  // 重複した num は、勝った側の書き込みも含めて取り消す (どちらが正か決められない)
  const conflicted = new Set(conflicts)
  const safeWrites = writes.filter((w) => !conflicted.has(w.num))

  // シートに無い番号は消さない。同期漏れと削除を区別できないため
  const kept = Object.keys(existing).filter((num) => !seen.has(num))

  return {
    writes: safeWrites,
    deletes: [],
    kept,
    unchanged,
    ignored,
    conflicts: [...conflicted],
    refused,
  }
}
