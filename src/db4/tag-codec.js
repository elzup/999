// 出典タグ (tags コレクション) と語の sourceId の受け渡し (D-0176)。
// DB の語は出典をタグの ID (sourceId) で指す。中の処理 (表記の組み立て・照合) はタグのコード (ｺｰﾄﾞｷﾞｱｽ など) で
// 扱うので、DB から読むときに source (コード) へ、書くときに sourceId へ変える。境目はここだけ
import { issueTagId } from './ids.js'

export const TAGS = 'tags'

/**
 * DB の語 → 中で使う語 ({ ...語, source: タグのコード })。
 * 移行前の語 (source を文字列で持つ) もそのまま読める (移行の間に旧い語が残っても止めない)
 */
export function decodeWords(rawWords, tags) {
  const byId = new Map(tags.map((t) => [t.id, t]))
  return rawWords.map(({ sourceId, ...word }) => {
    if (!sourceId) return { ...word, source: word.source ?? '' }
    const tag = byId.get(sourceId)
    // 指すタグが無いまま読むと出典が黙って消える。壊れたものは渡さない
    if (!tag)
      throw new Error(`tags にないタグを指している: ${word.id} → ${sourceId}`)
    return { ...word, source: tag.code }
  })
}

/**
 * 中で使う語 → DB に書く語 ({ ...語, sourceId })。知らないコードは新しいタグにする
 * @returns {{ docs, newTags }} newTags は書く必要がある新しいタグ
 */
export function encodeWords(words, tags, issue = issueTagId) {
  const known = new Map(tags.map((t) => [t.code, t]))
  const fresh = words
    .map((w) => w.source)
    .filter(
      (code, i, all) => code && !known.has(code) && all.indexOf(code) === i
    )
    .map((code) => ({ id: issue(), code, title: '', short: '' }))
  const byCode = new Map([...known, ...fresh.map((t) => [t.code, t])])
  const docs = words.map(({ source, ...word }) =>
    source ? { ...word, sourceId: byCode.get(source).id } : word
  )
  return { docs, newTags: fresh }
}
