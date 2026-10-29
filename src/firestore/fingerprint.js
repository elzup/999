// 同期対象 8 列の指紋。10 番号ずつ 100 グループを各 2 文字にし、200 文字で全体を表す。
// シート / DB / PC キャッシュの指紋を並べると、どの十の位が食い違っているかが分かる。
// spec: .vsdd/firestore-store/specs/design-sheet-bisync.md
//
// このモジュールは Function からも読み込む。fs / crypto 依存を持ち込まないこと。

import { SHEET_FIELDS } from './sheet-bisync.js'

export const GROUP_SIZE = 10
export const GROUP_COUNT = 100
const ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_'
// 2 文字 = 64 × 64 = 4096 通り。変化を見逃すのはグループあたり約 1/4096 で、
// «どこが変わったか» を見つける用途には十分
const CHARS_PER_GROUP = 2
// 番号の区切りと列の区切り。語やかなに現れない制御文字を使う
const NUM_SEP = '\u001e'
const FIELD_SEP = '\u001f'

/** FNV-1a (32 bit)。暗号強度は要らず、ブラウザでも同じ値になる単純さを優先 */
function fnv1a(text) {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193) >>> 0
  }
  return hash
}

function encode(hash) {
  return ALPHABET[hash & 63] + ALPHABET[(hash >>> 6) & 63]
}

/**
 * @param forms { [num]: { hito, mono, wh1k, ... } } 正規化済みのシート形
 * @returns 200 文字。グループ i は 番号 i*10 〜 i*10+9
 */
export function fingerprint(forms) {
  const groups = Array.from({ length: GROUP_COUNT }, () => [])
  for (const num of Object.keys(forms).sort()) {
    const index = Math.floor(Number(num) / GROUP_SIZE)
    if (!(index >= 0 && index < GROUP_COUNT)) continue
    const values = SHEET_FIELDS.map((field) => forms[num]?.[field] ?? '')
    groups[index].push([num, ...values].join(FIELD_SEP))
  }
  return groups.map((lines) => encode(fnv1a(lines.join(NUM_SEP)))).join('')
}

/** 食い違うグループの番号 (0〜99)。どちらかが無ければ空 */
export function diffGroups(a, b) {
  if (!a || !b) return []
  const out = []
  for (let i = 0; i < GROUP_COUNT; i++) {
    const at = i * CHARS_PER_GROUP
    if (a.slice(at, at + CHARS_PER_GROUP) !== b.slice(at, at + CHARS_PER_GROUP))
      out.push(i)
  }
  return out
}

/** グループ番号を «230-239» の形に */
export const groupLabel = (index) => {
  const from = String(index * GROUP_SIZE).padStart(3, '0')
  const to = String(index * GROUP_SIZE + GROUP_SIZE - 1).padStart(3, '0')
  return `${from}-${to}`
}

/** 100 番号ずつ 10 行に折る。1 行 20 文字で、2 文字ごとに十の位が 1 つ進む */
export function fingerprintLines(fp) {
  const width = (GROUP_COUNT / 10) * CHARS_PER_GROUP
  return Array.from({ length: 10 }, (_, i) =>
    (fp ?? '').slice(i * width, (i + 1) * width)
  )
}
