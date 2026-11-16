// タグ違いの語を出典ごとに分ける (D-0039〜D-0041)。console と画像取得で使う。
// 規則は app/lib/tagVariants.ts と同じ (一致はテストで確かめる)。
// 画像のキーは «旧スロット#タグ» (例 w1_2#res)。配信データへは tag-images.js が写す。

// 語の性質を表すタグ (#g 概念 / #i 身内) は出典ではないので分けない。app/lib/wordTags.ts の TAG_MEANINGS
const ATTRIBUTE_TAGS = new Set(['g', 'i'])
const TAG_RE = /#([^\s#,]+)/g

const tagsOf = (word) => [
  ...new Set([...String(word ?? '').matchAll(TAG_RE)].map((m) => m[1])),
]

/** 語に付いた出典タグ (属性タグを除く)。書かれた順 */
export const sourceTags = (word) =>
  tagsOf(word).filter((tag) => !ATTRIBUTE_TAGS.has(tag))

function removeTag(word, tag) {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return word
    .replace(new RegExp(`#${escaped}(?=[\\s#,]|$)`, 'g'), '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** 出典タグが 2 つ以上ある語を、出典タグ 1 つずつの語に分ける。1 つ以下ならそのまま */
export function splitVariants(word) {
  const tags = sourceTags(word)
  if (tags.length < 2) return [word]
  return tags.map((keep) =>
    tags
      .filter((tag) => tag !== keep)
      .reduce((acc, tag) => removeTag(acc, tag), word)
  )
}

export const variantSlot = (slot, tag) => `${slot}#${tag}`

/** «w1_2#res» → { base: 'w1_2', tag: 'res' }。タグ無しは tag が null */
export function parseSlot(slot) {
  const at = slot.indexOf('#')
  return at < 0
    ? { base: slot, tag: null }
    : { base: slot.slice(0, at), tag: slot.slice(at + 1) }
}

/**
 * 対象の枠を、タグ違いで分けた枠に置き換えて並べる。
 * 分けた枠の語は target[«旧スロット#タグ»] に入れて返す (console はこれを 1 枚のカードにする)
 */
export function expandVariants(target, baseSlots) {
  const slots = []
  const words = {}
  for (const slot of baseSlots) {
    const word = target[slot]
    const tags = sourceTags(word)
    if (!word || tags.length < 2) {
      slots.push(slot)
      continue
    }
    splitVariants(word).forEach((variant, i) => {
      const key = variantSlot(slot, tags[i])
      slots.push(key)
      words[key] = variant
    })
  }
  return { ...target, ...words, slots }
}
