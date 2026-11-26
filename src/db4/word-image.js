// 記号ごとの画像 (link.imageUrl) から、語の画像 (word.imageUrl) を決める (DB 計画 P8)。
// 1 語の画像が 1 種類ならそれを語に載せる。2 種類以上なら決めずに保留 (人が選ぶ)。
// 記号ごとの画像はそのまま残す (記号ごとの上書き)。語に画像がある語は変えない

// 画像の正本 imageSlots の枠名 (旧称) → 役と順番。src/images/tag-images.js の MANIFEST_SLOT と同じ対応
const IMAGE_SLOT = {
  w1: ['person', 0],
  w1_2: ['person', 1],
  wh3: ['person', 2],
  w2: ['thing', 0],
  w2_2: ['thing', 1],
  wm3: ['thing', 2],
}

/**
 * imageSlots の文書 ({ id: '043:w1#ｽﾀﾚ', image: { url } }) → その画像が付く結び付き ({ wordId, imageUrl })。
 * タグ付きの枠はその出典の語、タグ無しは枠の先頭の語。当たる語が無い枠 (語が消えた) は捨てる
 */
export function linkImagesFromSlots(imageSlots, symbols, words) {
  const symbolsById = new Map(symbols.map((s) => [s.id, s]))
  const sourceOf = new Map(words.map((w) => [w.id, w.source]))
  return imageSlots.flatMap((doc) => {
    const url = doc.image?.url
    const [num, slotKey] = String(doc.id).split(':')
    const [base, tag] = String(slotKey ?? '').split('#')
    const at = IMAGE_SLOT[base]
    const symbol = symbolsById.get(`num:${num}`)
    if (!url || !at || !symbol) return []
    const here = symbol.links.filter(
      (l) => l.role === at[0] && l.order === at[1]
    )
    const link = tag
      ? here.find((l) => sourceOf.get(l.wordId) === tag)
      : here[0]
    return link ? [{ wordId: link.wordId, imageUrl: url }] : []
  })
}

/**
 * @param linkImages 省略時は記号ごとの画像 (link.imageUrl)
 * @returns {{ set: [{wordId, imageUrl}], conflicts: [{wordId, images}] }}
 */
export function wordImagePlan({ symbols, words, linkImages }) {
  const pairs =
    linkImages ??
    symbols.flatMap((s) =>
      s.links
        .filter((l) => l.imageUrl)
        .map((l) => ({ wordId: l.wordId, imageUrl: l.imageUrl }))
    )
  const imagesOf = pairs.reduce(
    (acc, p) =>
      acc.set(p.wordId, new Set([...(acc.get(p.wordId) ?? []), p.imageUrl])),
    new Map()
  )
  const hasImage = new Set(words.filter((w) => w.imageUrl).map((w) => w.id))
  const entries = [...imagesOf]
    .filter(([wordId]) => !hasImage.has(wordId))
    .map(([wordId, images]) => ({ wordId, images: [...images].sort() }))
  return {
    set: entries
      .filter((e) => e.images.length === 1)
      .map((e) => ({ wordId: e.wordId, imageUrl: e.images[0] })),
    conflicts: entries.filter((e) => e.images.length > 1),
  }
}
