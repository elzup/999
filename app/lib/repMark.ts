// 代表の順位の印。代表は記号ごとに順序付きで数の上限なし (D-0170)
const CIRCLED = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫⑬⑭⑮⑯⑰⑱⑲⑳'

/** 1 → ①、20 まで丸数字、それより先は (21)。0 (代表でない) は空 */
export const repMark = (rank: number) =>
  rank <= 0 ? '' : CIRCLED[rank - 1] ?? `(${rank})`
