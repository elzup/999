// w1/w2 の語呂文字列から画像検索クエリを組み立てる。
// extractName (src/words.js) は #タグ を捨てるが、こちらは作品名=検索文脈として #タグ を残す。

/**
 * 語呂文字列を検索ワードに変換する。
 * '#' は作品名等の文脈なのでスペース区切りで展開して残す。
 * tagMap があれば略語タグを正式名に展開する (例: pr -> プリコネ)。
 * 例: 'マオ#コードギアス' -> 'マオ コードギアス'
 *     'ミミ#pr' (tagMap{pr:'プリコネ'}) -> 'ミミ プリコネ'
 *     '麻衣(先輩),まい' -> '麻衣'
 */
export function buildSearchWord(w, tagMap = {}) {
  if (!w) return ''
  const parts = w.split('#').map((p) => p.trim())
  const head = parts[0]
  const tags = parts.slice(1).map((t) => {
    const clean = t.replace(/\s+-\w+$/, '').trim() // 末尾 " -a" 等を除去してから照合
    return tagMap[clean] || clean
  })
  const expanded = [head, ...tags].filter(Boolean).join(' ')
  const noSuffix = expanded.replace(/\s+-\w+$/g, '').trim()
  const firstItem = noSuffix.split(',')[0].trim()
  return firstItem.replace(/\([^)]*\)/g, '').trim()
}

/**
 * 画像検索に渡すクエリ。title「語呂 999」は付与しない方針。
 */
export function buildQuery(w) {
  return buildSearchWord(w)
}
