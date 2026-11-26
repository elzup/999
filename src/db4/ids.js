// 記号と語の ID。spec: .metarc/db-design-v4.md §3.5 / D-0164
//
// 語の ID は «移行のときだけ» 種から hash で作り、以後は固定値として扱う (中身から作り直さない)。
// 移行のあとに入る語は乱数で発番する。どちらも同じ形 (w_ + 10 字)。

import { createHash, randomBytes } from 'node:crypto'

// 読み違えやすい 0 / 1 / l / o を除いた 32 字。1 字 5 bit
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz'
const ID_CHARS = 10

export const WORD_ID_RE = /^w_[2-9a-km-np-z]{10}$/

/** 先頭から 5 bit ずつ 32 字に写す (40 bit 以上ある前提) */
function encodeBits(bytes) {
  const bits = [...bytes].map((b) => b.toString(2).padStart(8, '0')).join('')
  return Array.from(
    { length: ID_CHARS },
    (_, i) => ALPHABET[parseInt(bits.slice(i * 5, i * 5 + 5), 2)]
  ).join('')
}

/** 移行用: 種 (本体|出典|最初の記号:role:order) が同じなら同じ ID。移行をやり直しても変わらない */
export const migrationWordId = (seed) =>
  `w_${encodeBits(createHash('sha1').update(seed).digest())}`

/** 新しい語の ID。重なりは書き込み口が transaction の中で確かめる */
export const issueWordId = (random = randomBytes) =>
  `w_${encodeBits(random(ID_CHARS))}`

const pad3 = (num) => String(num).padStart(3, '0')

export const symbolIdOf = {
  num: (num) => `num:${pad3(num)}`,
  date: (key) => `date:${key}`,
  card: (suit, rank) => `card:${suit}${rank}`,
  ff: (hex) => `ff:${String(hex).toUpperCase()}`,
}
