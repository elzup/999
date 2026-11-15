// 2文字読みのセルを五十音表のように並べる。行 = 頭の音 (拗音・外来音は頭のかな、長音は行)、列 = 段 (あいうえお)。
import type { YomiItem } from './yomiDrill'

export const VOWEL_LABELS = ['あ', 'い', 'う', 'え', 'お'] as const
const VOWEL_COUNT = VOWEL_LABELS.length

// 清音・濁音・半濁音の五十音。や行・わ行の空きは '・' で埋めて «位置 % 5 = 段» を保つ
const GOJUON =
  'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもや・ゆ・よらりるれろわ・・・を' +
  'がぎぐげござじずぜぞだぢづでどばびぶべぼぱぴぷぺぽ'
// 小書きのかな → 段。拗音 (ゃゅょ) も外来音 (ぁぃぅぇぉ) も同じ段に置く
const SMALL_VOWEL: Record<string, number> = {
  ぁ: 0,
  ゃ: 0,
  ぃ: 1,
  ぅ: 2,
  ゅ: 2,
  ぇ: 3,
  ぉ: 4,
  ょ: 4,
}
// ゔ は五十音表に無いので う段の «う» の後ろに並べる
const EXTRA_ORDER: Record<string, number> = { ゔ: GOJUON.indexOf('う') + 0.5 }

const posOf = (ch: string) => {
  const i = GOJUON.indexOf(ch)
  return i >= 0 ? i : EXTRA_ORDER[ch] ?? Number.MAX_SAFE_INTEGER
}

export type YomiRow = {
  key: string
  label: string
  /** 段ごとのセル (無い段は null) */
  cells: (YomiItem | null)[]
}

type Placement = { rowKey: string; label: string; order: number; col: number }

/** 1 つの読みが入る行と段。置けない並び (小書きでも ー でもない) は null */
export function placeYomi(kana: string): Placement | null {
  const [head, tail] = [...kana]
  if (tail === 'ー') {
    const pos = posOf(head)
    if (pos === Number.MAX_SAFE_INTEGER) return null
    const rowStart = pos - (pos % VOWEL_COUNT)
    const rowHead = GOJUON[rowStart]
    return {
      rowKey: `long:${rowHead}`,
      label: `${rowHead}行`,
      order: rowStart,
      col: pos % VOWEL_COUNT,
    }
  }
  const col = SMALL_VOWEL[tail]
  if (col === undefined) return null
  return { rowKey: `head:${head}`, label: head, order: posOf(head), col }
}

/** 読みの一覧を行に分ける。行は五十音順、同じ段に 2 つ来たら後から来た方を行を分けて置く */
export function layoutYomi(items: YomiItem[]): {
  rows: YomiRow[]
  unplaced: YomiItem[]
} {
  const unplaced: YomiItem[] = []
  const rowMap = new Map<
    string,
    { label: string; order: number; cells: (YomiItem | null)[] }
  >()
  for (const item of items) {
    const at = placeYomi(item.kana)
    if (!at) {
      unplaced.push(item)
      continue
    }
    // 同じ段が埋まっていたら «2» 行目を作る (表の形を崩さず全部見せるため)
    let key = at.rowKey
    let n = 1
    while (rowMap.get(key)?.cells[at.col]) key = `${at.rowKey}#${++n}`
    const row = rowMap.get(key) ?? {
      label: at.label,
      order: at.order + n / 100,
      cells: Array(VOWEL_COUNT).fill(null),
    }
    rowMap.set(key, {
      ...row,
      cells: row.cells.map((c, i) => (i === at.col ? item : c)),
    })
  }
  const rows = [...rowMap.entries()]
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([key, r]) => ({ key, label: r.label, cells: r.cells }))
  return { rows, unplaced }
}
