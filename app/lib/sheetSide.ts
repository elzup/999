import { createContext } from 'preact'

/**
 * DetailSheet の最下段 (‹ 前｜閉じる｜次 ›) の右端に置く枠。カードの ★ / 編集 の行と
 * 最下段の 2 行をまたぐ図 (ティアカバー) をここへ portal する (D-0103)。
 * カードを積む面 (stacked) と 2桁の ★ がある面は 2 行が隣り合わないので null
 */
export const SheetSideContext = createContext<HTMLElement | null>(null)
