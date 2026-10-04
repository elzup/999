// Bing 画像検索 (キー不要・非公式)。DDG が 403 で塞がれたときの代替。
// images/async の HTML に埋まった m="{...}" (HTML エスケープされた JSON) から直リンクを抜く。

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36'

const RESULT_COUNT = 20

function decodeEntities(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&') // 最後に戻す (&amp;quot; を二重デコードしないため)
}

/**
 * images/async の HTML から候補を抜く。
 * @param {string} html
 * @returns {{imageUrl:string, sourcePage:string}[]}
 */
export function parseBingImages(html) {
  return [...html.matchAll(/\bm="(\{[^"]*\})"/g)].flatMap((match) => {
    try {
      const meta = JSON.parse(decodeEntities(match[1]))
      return meta.murl
        ? [{ imageUrl: meta.murl, sourcePage: meta.purl || '' }]
        : []
    } catch {
      // m 属性は画像タイル以外にも付く。JSON でないものは候補ではないので捨てる
      return []
    }
  })
}

/**
 * @param {string} query
 * @param {boolean} safe  セーフサーチ (既定 ON)
 * @returns {Promise<{imageUrl:string, sourcePage:string}[]>}
 */
export async function bingSearchImages(query, safe = true) {
  const url =
    `https://www.bing.com/images/async?q=${encodeURIComponent(query)}` +
    `&first=0&count=${RESULT_COUNT}&adlt=${safe ? 'strict' : 'off'}&mkt=ja-JP`
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'ja,en;q=0.9' },
  })
  if (!res.ok) throw new Error(`Bing ${res.status}`)
  return parseBingImages(await res.text())
}
