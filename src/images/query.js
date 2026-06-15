// w1/w2 の語呂文字列から画像検索クエリを組み立てる。
// extractName (src/words.js) は #タグ を捨てるが、こちらは作品名=検索文脈として #タグ を残す。

/**
 * 語呂文字列を検索ワードに変換する。
 * '#' は作品名等の文脈なのでスペース区切りで展開して残す。
 * 例: 'マオ#コードギアス' -> 'マオ コードギアス'
 *     '麻衣(先輩),まい' -> '麻衣'
 */
export function buildSearchWord(w) {
  if (!w) return ''
  const expanded = w
    .split('#')
    .map((p) => p.trim())
    .filter(Boolean)
    .join(' ')
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
