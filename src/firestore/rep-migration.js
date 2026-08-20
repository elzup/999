// word-rep.json -> numbers/{num} の移行。
// spec: .vsdd/firestore-store/specs/spec-rep-migration.md
//
// word-rep.json はローカル 1 箇所にしか存在せず、実際に git 操作で数件を失った。
// 移行そのものが同じ事故を起こしては元も子もないので、
//   - 移行元は読むだけ (書き換えない)
//   - 移行先に既に値があれば上書きせず中止
//   - 件数が合わなければ異常終了
// を守る。

import { nameOf } from './console-writes.js'

/** 値が現在の候補に解決できるか。できなくても値は捨てない (REQ-MIG-003) */
function resolvable(slots, entry) {
  return Object.values(slots ?? {}).some(
    (slot) => slot?.kana === entry.k && (slot?.word ?? '') === (entry.w ?? '')
  )
}

/** 語の本体だけなら一致するか (タグが付いただけの変化を stale としない) */
function looselyResolvable(slots, entry) {
  return Object.values(slots ?? {}).some(
    (slot) => slot?.kana === entry.k && nameOf(slot?.word) === nameOf(entry.w)
  )
}

function markStale(slots, entries) {
  return (entries ?? []).map((entry) =>
    resolvable(slots, entry) || looselyResolvable(slots, entry)
      ? entry
      : { ...entry, stale: true }
  )
}

/**
 * 移行プランを組み立てる。実際の書き込みはしない。
 *
 * @param store    word-rep.json の中身 { rep, scores }
 * @param existing 移行先の numbers ドキュメント { [num]: doc }
 * @returns { writes, blocked, missing, counts }
 */
export function planRepMigration({ store, existing, now }) {
  const writes = []
  const blocked = []
  const missing = []

  const nums = new Set([
    ...Object.keys(store?.rep ?? {}),
    ...Object.keys(store?.scores ?? {}),
  ])

  for (const num of [...nums].sort()) {
    const target = existing[num]
    if (!target) {
      // 先に numbers を作ってから移行する。黙って作ると語が空の文書ができる
      missing.push(num)
      continue
    }
    // REQ-MIG-005: 既に入っているものを上書きしない
    const hasRep = target.rep != null
    const hasRatings = (target.ratings ?? []).length > 0
    if (hasRep || hasRatings) {
      blocked.push(num)
      continue
    }

    const doc = { ...target, updatedAt: now, source: 'console' }
    delete doc.derived

    const rep = store.rep?.[num]
    if (rep) {
      doc.rep = { ...rep, picks: markStale(target.slots, rep.picks) }
    }
    const scores = store.scores?.[num]
    if (scores) doc.ratings = markStale(target.slots, scores)

    writes.push({ num, doc, expectedUpdatedAt: target.updatedAt ?? null })
  }

  return {
    writes,
    blocked,
    missing,
    counts: countOf(store),
  }
}

/** 移行元の件数。移行後の照合に使う (REQ-MIG-004) */
export function countOf(store) {
  const reps = Object.values(store?.rep ?? {})
  return {
    reps: reps.length,
    picks: reps.reduce((sum, r) => sum + (r.picks?.length ?? 0), 0),
    ratings: Object.values(store?.scores ?? {}).reduce(
      (sum, list) => sum + list.length,
      0
    ),
  }
}

/** 書き込みプランが持っている件数 */
export function countOfWrites(writes) {
  return {
    reps: writes.filter((w) => w.doc.rep).length,
    picks: writes.reduce((sum, w) => sum + (w.doc.rep?.picks?.length ?? 0), 0),
    ratings: writes.reduce((sum, w) => sum + (w.doc.ratings?.length ?? 0), 0),
  }
}

/**
 * REQ-MIG-004: 移行前後で件数が合わなければ異常終了させるための照合。
 * 移行できなかった番号 (blocked / missing) の分は差し引いて比べる。
 */
export function reconcile(plan, store) {
  const skipped = [...plan.blocked, ...plan.missing]
  const expected = countOf({
    rep: Object.fromEntries(
      Object.entries(store?.rep ?? {}).filter(([num]) => !skipped.includes(num))
    ),
    scores: Object.fromEntries(
      Object.entries(store?.scores ?? {}).filter(
        ([num]) => !skipped.includes(num)
      )
    ),
  })
  const actual = countOfWrites(plan.writes)

  const mismatched = Object.keys(expected).filter(
    (key) => expected[key] !== actual[key]
  )
  if (mismatched.length) return { error: 'count mismatch', expected, actual }
  return { ok: true, expected, actual, skipped }
}
