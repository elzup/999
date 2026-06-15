// DuckDuckGo 画像検索 (キー不要・非公式)。直リンク画像URLを返す。
// vqd トークンを取得 → i.js で JSON 取得、の2段。

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36'

async function getVqd(query) {
  const res = await fetch(
    `https://duckduckgo.com/?q=${encodeURIComponent(
      query
    )}&iar=images&iax=images&ia=images`,
    {
      headers: { 'user-agent': UA },
    }
  )
  const html = await res.text()
  const m = html.match(/vqd=["']?([\d-]+)["']?/) || html.match(/vqd=([\d-]+)&/)
  return m ? m[1] : null
}

/** @returns {Promise<{imageUrl:string, sourcePage:string}|null>} */
export async function ddgSearchImage(query) {
  const vqd = await getVqd(query)
  if (!vqd) return null
  const url =
    `https://duckduckgo.com/i.js?l=jp-jp&o=json&q=${encodeURIComponent(
      query
    )}` + `&vqd=${vqd}&f=,,,,,&p=-1`
  const res = await fetch(url, {
    headers: { 'user-agent': UA, referer: 'https://duckduckgo.com/' },
  })
  if (!res.ok) throw new Error(`DDG ${res.status}`)
  const data = await res.json()
  const results = data.results || []
  const pick =
    results.find((r) => /\.(jpe?g|png|webp)(\?|$)/i.test(r.image || '')) ||
    results[0]
  if (!pick) return null
  return { imageUrl: pick.image, sourcePage: pick.url || '' }
}
