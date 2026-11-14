// 画像 manifest と配信データの間で、タグ違いの画像 (D-0039) を受け渡す

// manifest の旧スロット名 → 配信データのスロット名 (console の w1 = wh1 など)
const MANIFEST_SLOT = { w1: 'wh1', w1_2: 'wh2', w2: 'wm1', w2_2: 'wm2' }

/**
 * タグ違いで分けた語の画像。manifest では «旧スロット#タグ» (例 w1_2#res) の
 * キーに置き、配信データでは wh2TagImg: { res: url } にまとめる (D-0039)
 */
export function tagImagesOf(slots) {
  const out = {}
  for (const [key, value] of Object.entries(slots ?? {})) {
    const at = key.indexOf('#')
    if (at < 0 || !value?.url) continue
    const slot = MANIFEST_SLOT[key.slice(0, at)]
    const tag = key.slice(at + 1)
    if (!slot || !tag) continue
    const field = `${slot}TagImg`
    out[field] = { ...out[field], [tag]: value.url }
  }
  return out
}
