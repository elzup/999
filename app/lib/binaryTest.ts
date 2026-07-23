// バイナリー記憶(Binary Numbers)テストのロジック。
// 日本メモリースポーツ協会 公式ルール準拠:
//   ・1行 = 30桁の "0"/"1"
//   ・採点は1行ごと。全問正解=30pt / 1つ間違い=15pt / 2つ以上=0pt。
//   ・最後の行は記入した桁数までを基準にし、同じ比率で減点。端数は切り上げ。
//     (例: 21桁記入・全正解=21pt / 1ミス=ceil(21/2)=11pt / 2ミス以上=0pt)
// この規則は「記入桁数 attempted に対し ミス0→attempted, ミス1→ceil(attempted/2),
// ミス2+→0」という1つの式に統一できる(30桁満杯なら 30/15/0 に一致)。

export const BINARY_DIGITS_PER_ROW = 30

// 開始前に選べる可変プリセット(記憶時間 / 行数)。
export const BINARY_MEMO_OPTIONS = [
  { sec: 30, label: '30秒' },
  { sec: 60, label: '1分' },
  { sec: 180, label: '3分' },
  { sec: 300, label: '5分(公式)' },
] as const

export const BINARY_ROW_OPTIONS = [5, 10, 25] as const

const randBit = (): string => (Math.random() < 0.5 ? '0' : '1')

export function genBinaryRow(): string {
  return Array.from({ length: BINARY_DIGITS_PER_ROW }, randBit).join('')
}

export function genBinaryRows(rows: number): string[] {
  return Array.from({ length: rows }, genBinaryRow)
}

// 連続入力した数字列を1行30桁ごとに分割する。末尾が最後の(途中)行になる。
export function chunkRows(
  entered: string,
  rowLen: number = BINARY_DIGITS_PER_ROW
): string[] {
  if (entered.length === 0) return []
  const rows: string[] = []
  for (let i = 0; i < entered.length; i += rowLen) {
    rows.push(entered.slice(i, i + rowLen))
  }
  return rows
}

export type BinaryRowScore = {
  attempted: number
  errors: number
  points: number
}

// 1行の採点。attempted=入力桁数。ミス0→満点(=attempted), ミス1→切り上げ半分, ミス2+→0。
export function scoreBinaryRow(
  userRow: string,
  correctRow: string
): BinaryRowScore {
  const attempted = userRow.length
  let errors = 0
  for (let i = 0; i < attempted; i++) {
    if (userRow[i] !== correctRow[i]) errors++
  }
  const points =
    errors === 0 ? attempted : errors === 1 ? Math.ceil(attempted / 2) : 0
  return { attempted, errors, points }
}

export type BinaryRowResult = BinaryRowScore & {
  index: number
  userRow: string
  correctRow: string
}

export type BinaryScore = {
  points: number
  maxPoints: number
  rows: BinaryRowResult[]
}

// グリッド全体の採点。userRows が短い(未着手の末尾行)場合は空行=0点として扱う。
export function scoreBinary(
  userRows: string[],
  correctRows: string[]
): BinaryScore {
  const rows: BinaryRowResult[] = correctRows.map((correctRow, index) => {
    const userRow = userRows[index] ?? ''
    const score = scoreBinaryRow(userRow, correctRow)
    return { index, userRow, correctRow, ...score }
  })
  const points = rows.reduce((sum, row) => sum + row.points, 0)
  const maxPoints = correctRows.length * BINARY_DIGITS_PER_ROW
  return { points, maxPoints, rows }
}
