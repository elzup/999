import type { NumberEntry } from '../data/schema'
import { parseTaggedItems } from './tags'

export const CATS = ['hito', 'mono', 'gainen'] as const
export type Cat = (typeof CATS)[number]

export const CAT_LABEL: Record<Cat, string> = {
  hito: '人',
  mono: 'モノ',
  gainen: '概念',
}

// カテゴリ色 (blue / orange / aqua)。ダーク面 #1a1d27 に対し
// 全ペアで CVD ΔE 9.4・通常視 ΔE 20.9・コントラスト 3:1 以上を満たす組。
export const CAT_COLOR: Record<Cat, string> = {
  hito: '#3987e5',
  mono: '#d95926',
  gainen: '#199e70',
}

/** 1 番号の中の 人 ↔ モノ の傾き。両極 + ニュートラル中点の発散スケール。 */
export const MIX_KINDS = [
  'hito',
  'hitoLean',
  'even',
  'monoLean',
  'mono',
  'none',
] as const
export type MixKind = (typeof MIX_KINDS)[number]

export const MIX_LABEL: Record<MixKind, string> = {
  hito: '人のみ',
  hitoLean: '人が多い',
  even: '人 = モノ',
  monoLean: 'モノが多い',
  mono: 'モノのみ',
  none: '人モノなし',
}

// 発散スケール: 両極は 人/モノ のカテゴリ色、中点は無彩色。
// 「なし」は地に沈める空セル扱い (色分けではなく不在の表現)。
export const MIX_COLOR: Record<MixKind, string> = {
  hito: '#3987e5',
  hitoLean: '#7ba6e4',
  even: '#9aa2ad',
  monoLean: '#dd9068',
  mono: '#d95926',
  none: '#2a2d37',
}

export type Mode = 'main' | 'all'

export type Counts = Record<Cat, number>

/** √1000 の平方レイアウトの一辺 (32×32 = 1024 ≧ 1000)。 */
export const SQUARE_SIDE = 32

const NUM_CATEGORIES = Array.from({ length: 1000 }, (_, i) =>
  String(i).padStart(3, '0')
)

export type HitoMonoCell = {
  num: string
  /** 百 / 十 / 一 の位。キューブ (10×10×10) の座標。 */
  h: number
  t: number
  o: number
  /** 平方レイアウト (32×32) の座標。 */
  sqCol: number
  sqRow: number
  main: Counts
  all: Counts
  mixMain: MixKind
  mixAll: MixKind
}

export type HitoMonoStats = {
  cells: HitoMonoCell[]
  totals: Record<Mode, Counts>
  mixCounts: Record<Mode, Record<MixKind, number>>
}

const zeroCounts = (): Counts => ({ hito: 0, mono: 0, gainen: 0 })

const zeroMix = (): Record<MixKind, number> =>
  Object.fromEntries(MIX_KINDS.map((k) => [k, 0])) as Record<MixKind, number>

/** カンマ区切りの候補欄から候補の実体数を数える。
 *  "ニーナ#a,#b" のようにタグだけを継ぎ足した項目は同一候補なので 1 と数える。 */
export function countCandidates(raw: string): number {
  const bases = new Set<string>()
  for (const item of parseTaggedItems(raw)) {
    if (item.base) bases.add(item.base)
  }
  return bases.size
}

/** 番号 1 件のカテゴリ別候補数。main は各カテゴリの第 1 候補だけを数える。 */
export function countEntry(entry: NumberEntry): Record<Mode, Counts> {
  const all: Counts = {
    hito: countCandidates(entry.hito),
    mono: countCandidates(entry.mono),
    gainen: countCandidates(entry.gainen),
  }
  const main: Counts = {
    hito: Math.min(all.hito, 1),
    mono: Math.min(all.mono, 1),
    gainen: Math.min(all.gainen, 1),
  }
  return { main, all }
}

export function mixOf(counts: Counts): MixKind {
  const { hito, mono } = counts
  if (hito === 0 && mono === 0) return 'none'
  if (mono === 0) return 'hito'
  if (hito === 0) return 'mono'
  if (hito > mono) return 'hitoLean'
  if (mono > hito) return 'monoLean'
  return 'even'
}

/** 000-999 の全 1000 セルを常に埋める (データに無い番号は「人モノなし」)。 */
export function buildHitoMono(numbers: NumberEntry[]): HitoMonoStats {
  const byNum = new Map(numbers.map((n) => [n.num, n]))
  const cells: HitoMonoCell[] = []
  const totals: Record<Mode, Counts> = { main: zeroCounts(), all: zeroCounts() }
  const mixCounts: Record<Mode, Record<MixKind, number>> = {
    main: zeroMix(),
    all: zeroMix(),
  }

  for (let i = 0; i < 1000; i++) {
    const num = String(i).padStart(3, '0')
    const entry = byNum.get(num)
    const counts = entry
      ? countEntry(entry)
      : { main: zeroCounts(), all: zeroCounts() }

    for (const mode of ['main', 'all'] as const) {
      for (const cat of CATS) totals[mode][cat] += counts[mode][cat]
    }
    const mixMain = mixOf(counts.main)
    const mixAll = mixOf(counts.all)
    mixCounts.main[mixMain] += 1
    mixCounts.all[mixAll] += 1

    cells.push({
      num,
      h: Math.floor(i / 100),
      t: Math.floor(i / 10) % 10,
      o: i % 10,
      sqCol: i % SQUARE_SIDE,
      sqRow: Math.floor(i / SQUARE_SIDE),
      main: counts.main,
      all: counts.all,
      mixMain,
      mixAll,
    })
  }

  return { cells, totals, mixCounts }
}

/** 合計に対する各カテゴリの比率 (%)。合計 0 なら全て 0。 */
export function ratioOf(counts: Counts): Counts {
  const total = CATS.reduce((s, c) => s + counts[c], 0)
  if (total === 0) return zeroCounts()
  return Object.fromEntries(
    CATS.map((c) => [c, (counts[c] / total) * 100])
  ) as Counts
}

export type VizzuSeries =
  | { name: string; type: 'dimension'; categories: string[]; values: number[] }
  | { name: string; type: 'measure'; values: number[] }

/** Vizzu 用の列指向データ。1 セル × 3 カテゴリ = 3000 レコード。
 *  main / all は別系列に持たせ、チャンネルの差し替えだけで切り替える
 *  (Vizzu のデータは追記のみで、値の書き換えができないため)。 */
export function toVizzuSeries(stats: HitoMonoStats): VizzuSeries[] {
  const n = stats.cells.length * CATS.length
  const num: string[] = []
  const cat: number[] = []
  const h: number[] = []
  const t: number[] = []
  const o: number[] = []
  const sqCol: number[] = []
  const sqRow: number[] = []
  const mixMain: number[] = []
  const mixAll: number[] = []
  const nMain: number[] = []
  const nAll: number[] = []

  for (const cell of stats.cells) {
    for (let ci = 0; ci < CATS.length; ci++) {
      const c = CATS[ci]
      num.push(cell.num)
      cat.push(ci)
      h.push(cell.h)
      t.push(cell.t)
      o.push(cell.o)
      sqCol.push(cell.sqCol)
      sqRow.push(cell.sqRow)
      mixMain.push(MIX_KINDS.indexOf(cell.mixMain))
      mixAll.push(MIX_KINDS.indexOf(cell.mixAll))
      nMain.push(cell.main[c])
      nAll.push(cell.all[c])
    }
  }
  if (num.length !== n) throw new Error('series length mismatch')

  const digits = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
  const pad2 = Array.from({ length: SQUARE_SIDE }, (_, i) =>
    String(i).padStart(2, '0')
  )
  const mixCats = MIX_KINDS.map((k) => MIX_LABEL[k])

  return [
    {
      name: '番号',
      type: 'dimension',
      categories: NUM_CATEGORIES,
      values: num.map(Number),
    },
    {
      name: '種別',
      type: 'dimension',
      categories: CATS.map((c) => CAT_LABEL[c]),
      values: cat,
    },
    { name: '百', type: 'dimension', categories: digits, values: h },
    { name: '十', type: 'dimension', categories: digits, values: t },
    { name: '一', type: 'dimension', categories: digits, values: o },
    { name: '列', type: 'dimension', categories: pad2, values: sqCol },
    { name: '行', type: 'dimension', categories: pad2, values: sqRow },
    {
      name: '構成(メイン)',
      type: 'dimension',
      categories: mixCats,
      values: mixMain,
    },
    {
      name: '構成(全候補)',
      type: 'dimension',
      categories: mixCats,
      values: mixAll,
    },
    { name: '件数(メイン)', type: 'measure', values: nMain },
    { name: '件数(全候補)', type: 'measure', values: nAll },
  ]
}
