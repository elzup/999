// 代表語ピッカー (代表語コンソールのスマホ版) の判定と操作の組み立て。
// 絞り込みの規則は console/rep.js の FILTERS と同じ。
//
// 画面から切り離してあるのは、選ぶ順番と ①② の付き方をテストで確かめるため
// (numberDetail.ts を分けているのと同じ理由)。
import type { NumberDoc, RepPick } from './numberApi'
import { candidateRows, livePicks, sameValue } from './numberDetail'

export type RepFilter =
  | 'all'
  | 'open'
  | 'multi'
  | 'sameKind'
  | 'mono1'
  | 'stale'

export const REP_FILTERS: Array<[RepFilter, string]> = [
  ['all', 'すべて'],
  ['open', '未確定'],
  ['multi', '2択+'],
  ['sameKind', '同種ペア'],
  ['mono1', '物優先'],
  ['stale', '⚠再確認'],
]

export const MAX_PICKS = 2
const DECADES = 10

const isMono = (slot: string) => slot.startsWith('wm')

/** 代表に選ばれている枠を ①② の順に (タグ違いで分けた行もその枠の名前で返す) */
export function pickedSlots(doc: NumberDoc): string[] {
  return candidateRows(doc)
    .filter((row) => row.repRank > 0)
    .sort((a, b) => a.repRank - b.repRank)
    .map((row) => row.slot)
}

/**
 * 語を書き換えた・消した後に、今の候補のどれにも当たらなくなった代表がある。
 * 黙って別の語に付け替えず、選び直しを促す (rep-store の stale と同じ)
 */
export function isStale(doc: NumberDoc): boolean {
  return (doc.rep?.picks?.length ?? 0) > livePicks(doc).length
}

/**
 * 1 回のタップで代表がどう変わるか。key は候補行の key (candidateRows。
 * 分けていない行はスロット名なので、従来どおりスロット名でも引ける)。
 * 選ばれていない候補 → 空いている方 (① → ②) に入る。①② が埋まっていれば ② を置き換える。
 * 選ばれている候補 → 外す。① を外すと ② が ① に繰り上がる
 */
export function togglePick(doc: NumberDoc, key: string): RepPick[] {
  const picks = livePicks(doc)
  const row = candidateRows(doc).find((candidate) => candidate.key === key)
  if (!row) return picks
  const target = { k: row.kana, w: row.word }
  if (picks.some((pick) => sameValue(pick, target))) {
    return picks.filter((pick) => !sameValue(pick, target))
  }
  return picks.length >= MAX_PICKS ? [picks[0], target] : [...picks, target]
}

export function matchesFilter(doc: NumberDoc, filter: RepFilter): boolean {
  const order = pickedSlots(doc)
  switch (filter) {
    case 'open':
      return !doc.rep?.confirmed
    case 'multi':
      return candidateRows(doc).length >= 2
    case 'sameKind':
      return order.length === 2 && isMono(order[0]) === isMono(order[1])
    case 'mono1':
      return order.length > 0 && isMono(order[0])
    case 'stale':
      return isStale(doc)
    default:
      return true
  }
}

/** 十の位ごとの確定率 (0〜1)。百の位の中の 10 区切りを、ジャンプ用のボタンの下線に出す */
export function decadeProgress(docs: NumberDoc[]): number[] {
  const done = Array.from({ length: DECADES }, () => 0)
  const total = Array.from({ length: DECADES }, () => 0)
  for (const doc of docs) {
    const decade = Number(doc.num[1])
    total[decade] += 1
    if (doc.rep?.confirmed) done[decade] += 1
  }
  return done.map((count, i) => (total[i] ? count / total[i] : 0))
}

/** 代表を選んでいない番号を «そのまま確定» するときの並び (rep-store の DEFAULT_PRIORITY と同じ) */
const DEFAULT_PRIORITY = ['wh1', 'wm1', 'wh2', 'wm2', 'wh3', 'wm3']

/**
 * 代表が空のときに既定で入る候補行の key (① 人の 1 番手、② 物の 1 番手。無ければ次の候補)。
 * タグ違いで分けた枠は、その枠の先頭の行 (最初に書かれたタグ) を使う
 */
export function defaultPickSlots(doc: NumberDoc): string[] {
  const rows = candidateRows(doc)
  return DEFAULT_PRIORITY.map((slot) => rows.find((row) => row.slot === slot))
    .filter((row) => row !== undefined)
    .slice(0, MAX_PICKS)
    .map((row) => row.key)
}

/**
 * «確定» を押したとき (1 件でも一括でも) に送る操作。確定済み・要再確認は null:
 * - 代表があって未確定 → その代表のまま確定
 * - 代表が空 → 既定 (人の 1 番手 ①・物の 1 番手 ②) で確定
 * - 要再確認 (代表にした語が今の候補に無い) → 黙って付け替えず、選び直してもらう
 */
export function confirmOp(
  doc: NumberDoc
): { op: 'rep'; picks: RepPick[]; confirmed: true } | null {
  if (isStale(doc) || doc.rep?.confirmed) return null
  const live = livePicks(doc)
  if (live.length > 0) return { op: 'rep', picks: live, confirmed: true }
  const rows = candidateRows(doc)
  const picks = defaultPickSlots(doc).flatMap((key) => {
    const row = rows.find((candidate) => candidate.key === key)
    return row ? [{ k: row.kana, w: row.word }] : []
  })
  return picks.length ? { op: 'rep', picks, confirmed: true } : null
}
