// numbers/{num} への唯一の書き込み口。
// spec: .vsdd/firestore-store/specs/design-firestore-schema.md
//
// ここを通らない書き込みを作らないこと。rules 言語ではリスト要素
// (ratings[].v) を検証できないため、不変条件を守れる場所がここしかない。
//
// db は Firestore そのものではなく最小の口だけを受け取る:
//   db.runTransaction(fn) / tx.get(num) -> doc|undefined / tx.set(num, doc)
// こうしないとテストで «読んだ後に他の面が書いた» 状況を作れない。

import { withDerived } from './derived.js'
import { assertPreserves, validateNumberDoc } from './number-doc.js'

/**
 * @param db  { runTransaction }
 * @param num 3 桁の番号 (ドキュメント ID)
 * @param doc 書きたい中身。derived は含めてはいけない
 * @param expectedUpdatedAt 読み取り時点の updatedAt。省略時は競合検出をしない
 * @param intent 意図して変更するフィールド名。宣言していない保護対象が
 *               変われば事故として拒否する
 */
export async function writeNumber(
  db,
  { num, doc, expectedUpdatedAt, intent = [] }
) {
  // 検証はトランザクションの外で先に済ませる (無駄な読み取りを増やさない)
  const valid = validateNumberDoc(num, doc)
  if (valid.error) return valid

  return db.runTransaction(async (tx) => {
    const current = await tx.get(num)

    // REQ-FS-012: 読んでから書くまでに他の面が触っていたら諦める。
    // これが無いと、同期の最中に入ったコンソールの編集を巻き戻してしまう
    if (expectedUpdatedAt !== undefined) {
      const actual = current?.updatedAt ?? null
      if (actual !== expectedUpdatedAt) {
        return { error: 'conflict', expected: expectedUpdatedAt, actual }
      }
    }

    // REQ-FS-008: 失うと復元できないものを落としていないか、最後に確かめる
    const preserved = assertPreserves(current, doc, { intent })
    if (preserved.error) return preserved

    const next = withDerived(doc)
    await tx.set(num, next)
    return { ok: true, doc: next }
  })
}
