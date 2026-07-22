// 「間違えがちな文字」の統計。
// hex テスト(語→コード)の誤答を、正解コードと選んだコードの
// ニブル(=16進1桁)単位で突き合わせ、どの文字がどの文字に化けたかを数える。
// 表記が2進でも、統計はバイトを16進に直した「文字」単位で集計する
// (ユーザーの言う「間違えがちな文字」= 16進の桁)。

import { byteToNibbles } from './hexQuiz'

/** ニブル位置。hi=上位桁 / lo=下位桁 */
export type NibblePos = 'hi' | 'lo'

/** 1件の取り違え。「正解 from を to と間違えた」。 */
export type Confusion = { pos: NibblePos; from: string; to: string }

/** 取り違え回数のフラット集計。キーは confusionKey。 */
export type HexStats = Record<string, number>

const NIB = '0123456789ABCDEF'

function nibChar(n: number): string {
  return NIB[n & 0xf]
}

/** confusion を localStorage 用のキーにする (例 "lo:B>9")。 */
export function confusionKey(c: Confusion): string {
  return `${c.pos}:${c.from}>${c.to}`
}

/**
 * 正解バイトと選んだ(誤答)バイトを桁ごとに突き合わせ、
 * 異なる桁だけを Confusion として返す。
 */
export function confusionsOf(
  rightByte: number,
  wrongByte: number
): Confusion[] {
  const [rHi, rLo] = byteToNibbles(rightByte)
  const [wHi, wLo] = byteToNibbles(wrongByte)
  const out: Confusion[] = []
  if (rHi !== wHi) out.push({ pos: 'hi', from: nibChar(rHi), to: nibChar(wHi) })
  if (rLo !== wLo) out.push({ pos: 'lo', from: nibChar(rLo), to: nibChar(wLo) })
  return out
}

/** confusions を stats に足した新しい stats を返す(非破壊)。 */
export function accumulate(stats: HexStats, confusions: Confusion[]): HexStats {
  const next = { ...stats }
  for (const c of confusions) {
    const k = confusionKey(c)
    next[k] = (next[k] ?? 0) + 1
  }
  return next
}

export type CharStat = { char: string; count: number }
export type PairStat = { from: string; to: string; count: number }

/**
 * 統計を集計する。
 * - byChar: 「正解だったのに間違えられた文字」ランキング(桁位置は合算)。
 * - pairs:  「from を to と取り違えた」ペアのランキング(桁位置は合算)。
 */
export function summarize(stats: HexStats): {
  total: number
  byChar: CharStat[]
  pairs: PairStat[]
} {
  const charCount = new Map<string, number>()
  const pairCount = new Map<string, PairStat>()
  let total = 0

  for (const [key, count] of Object.entries(stats)) {
    const m = /^(hi|lo):(.)>(.)$/.exec(key)
    if (!m || count <= 0) continue
    const from = m[2]
    const to = m[3]
    total += count
    charCount.set(from, (charCount.get(from) ?? 0) + count)
    const pk = from + '>' + to
    const p = pairCount.get(pk) ?? { from, to, count: 0 }
    p.count += count
    pairCount.set(pk, p)
  }

  const byChar = [...charCount.entries()]
    .map(([char, count]) => ({ char, count }))
    .sort((a, b) => b.count - a.count || a.char.localeCompare(b.char))
  const pairs = [...pairCount.values()].sort(
    (a, b) => b.count - a.count || (a.from + a.to).localeCompare(b.from + b.to)
  )

  return { total, byChar, pairs }
}
