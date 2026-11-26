// numbers/{num} を書くとき、同じ中身を新しいコレクション symbols / words にも書く (DB 作り直しの段 2)。
// spec: .metarc/db-design-targets.md §5。正本はまだ numbers。こちらは写しで、読む側は無い。
//
// 書くものを «コレクション名・ID・中身» の一覧で返すだけ。書き方 (transaction か batch か) は呼ぶ側が決める。
// node:crypto を使うので Function と CLI 用 (端末のアプリからは読まない)。
import { createHash } from 'node:crypto'
import { toDbSymbol } from './db-shape.js'
import { byId, fromNumberDoc } from './model.js'

export const SYMBOLS = 'symbols'
export const WORDS = 'words'

/** 語の文書 ID。鍵 (種別|本体|出典) から 1 回だけ作り、以後は表記が変わっても変えない */
export const wordDocId = (key) =>
  'w_' + createHash('sha1').update(key).digest('hex').slice(0, 12)

// Firestore は undefined を受け付けない
const clean = (value) => JSON.parse(JSON.stringify(value))

/** 語の文書の中身。語は id から中身が決まるので、何度書いても同じ (merge で書く) */
export const wordDoc = (word) => ({
  category: word.category,
  text: word.text,
  source: word.source,
  key: word.id,
})

/**
 * 番号の文書 1 件 → symbols / words への書き込みの一覧。
 * 語は merge (既にある語の欄を消さない)、記号は丸ごと置き換える
 */
export function mirrorWrites(doc, now) {
  const { symbol, words } = fromNumberDoc(doc)
  const { doc: data } = toDbSymbol(symbol, byId(words), wordDocId)
  return [
    ...words.map((word) => ({
      col: WORDS,
      id: wordDocId(word.id),
      data: wordDoc(word),
      merge: true,
    })),
    {
      col: SYMBOLS,
      id: symbol.id,
      data: clean({ ...data, mirroredAt: now }),
      merge: false,
    },
  ]
}
