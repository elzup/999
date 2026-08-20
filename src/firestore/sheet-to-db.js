// シート -> DB の片方向同期。書き込みプランを組み立てるだけで、
// Firestore には触らない (テスト可能にするため)。
// spec: .vsdd/firestore-store/specs/spec-sheet-to-db-sync.md
//
// 第1段階では DB -> シートの書き戻しをやらない。競合解決と削除の伝播を
// 後回しにするため。代わりに「DB 側にしか無い情報を消さない」ことを厳守する。
// これは現状 nr push が 21 列で全上書きして rankey/check を消している事故の裏返し。

import { buildNumberDoc } from './number-doc.js'

/** シート由来で更新してよいフィールド。これ以外は既存値を残す */
const SHEET_OWNED = ['hito', 'mono', 'gainen']

/**
 * スロットをマージする。シートは画像 URL の列を持たないので、
 * 既存の imageUrl は必ず引き継ぐ。
 */
function mergeSlots(fromSheet, current = {}) {
  const merged = {}
  for (const [slot, next] of Object.entries(fromSheet)) {
    merged[slot] = {
      ...next,
      imageUrl: next.imageUrl || current[slot]?.imageUrl || '',
    }
  }
  return merged
}

/** 書き込みが要るかを、シート由来の部分だけで判定する (冪等性のため) */
function isUnchanged(next, current) {
  if (!current) return false
  if (JSON.stringify(next.slots) !== JSON.stringify(current.slots)) return false
  return SHEET_OWNED.every((key) => (next[key] || '') === (current[key] || ''))
}

/**
 * @param rows     シートの行 (words.tsv と同じ形)
 * @param existing 既存の numbers ドキュメント { [num]: doc }
 * @returns { writes, deletes, kept, unchanged, ignored }
 */
export function planSheetSync({ rows, existing = {}, now }) {
  const writes = []
  const seen = new Set()
  let unchanged = 0
  let ignored = 0

  for (const row of rows) {
    const num = (row.num || '').trim()
    if (!/^\d{3}$/.test(num)) {
      ignored++
      continue
    }
    seen.add(num)

    const current = existing[num]
    const fresh = buildNumberDoc({
      word: { ...row, num },
      source: 'sheet',
      now,
    })
    const doc = {
      ...fresh,
      slots: mergeSlots(fresh.slots, current?.slots),
      // DB 側にしか無い情報。シート同期では触らない
      rep: current?.rep ?? null,
      ratings: current?.ratings ?? [],
    }

    if (isUnchanged(doc, current)) {
      unchanged++
      continue
    }
    writes.push({ num, doc })
  }

  // シートに無い番号は消さない。同期漏れと削除を区別できないため
  const kept = Object.keys(existing).filter((num) => !seen.has(num))

  return { writes, deletes: [], kept, unchanged, ignored }
}
