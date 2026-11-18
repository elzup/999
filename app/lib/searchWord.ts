// 語から画像検索のワードを作る。略語タグは正式名に展開する (ミミ#pr -a → ミミ プリコネ)。
// src/images/query.js の buildSearchWord と同じ規則 (テストで突き合わせている)。
// 画像ピッカーを開いた瞬間に «何で検索しているか» を出すのに使う。実際の検索ワードはサーバが決めて返す
export function buildSearchWord(
  word: string,
  tagMap: Record<string, string> = {}
): string {
  if (!word) return ''
  const [head, ...rest] = word.split('#').map((part) => part.trim())
  const tags = rest.map((tag) => {
    const clean = tag.replace(/\s+-\w+$/, '').trim()
    return tagMap[clean] || clean
  })
  const expanded = [head, ...tags].filter(Boolean).join(' ')
  const firstItem = expanded
    .replace(/\s+-\w+$/g, '')
    .trim()
    .split(',')[0]
    .trim()
  return firstItem
    .replace(/\(([^)]*)\)/g, ' $1')
    .replace(/\s+/g, ' ')
    .trim()
}
