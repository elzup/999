// 派生値 (pt / rankey) の計算。
// spec: .vsdd/firestore-store/specs/design-derived-on-write.md
//
// slots と規則表からのみ決まる純粋関数。同じ入力からは常に同じ結果が出る。
// 書き込み経路が Function 1 箇所に絞られている (REQ-FS-006) ので、
// 別トリガにせずその経路で呼ぶ。再帰の心配が無く、コード経路が 1 つで済む。

import { rankey } from '../rankey.js'
import { scoreWithLabel } from '../scorer.js'

/**
 * numbers/{num} の slots から derived を作る。
 * かなが空のスロットは含めない。読めないかなは null を入れて処理は継続する。
 */
export function computeDerived(doc) {
  const ptBySlot = {}
  const rankeyBySlot = {}

  for (const [slot, value] of Object.entries(doc.slots || {})) {
    const kana = (value?.kana || '').trim()
    if (!kana) continue

    const label = value.word || ''
    try {
      ptBySlot[slot] = scoreWithLabel(kana, label).score
    } catch {
      ptBySlot[slot] = null
    }
    rankeyBySlot[slot] = rankey(kana, doc.num, label)
  }

  return { ptBySlot, rankeyBySlot }
}

/**
 * derived を付け直して返す。呼び出し元が渡してきた derived は必ず捨てる
 * (REQ-FS-005: derived はサーバ所有)。
 */
export function withDerived(doc) {
  return { ...doc, derived: computeDerived(doc) }
}
