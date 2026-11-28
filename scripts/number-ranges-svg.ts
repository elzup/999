// 999・日付 (mdd)・時刻 (hhmm, 12 時間制) の範囲の重なりを 1 枚の SVG にする (ブログ用の図)。
// 番号を 行 = 百の位から上 (n ÷ 100)、列 = 下 2 桁 (n mod 100) の 100 列に並べ、範囲を四角で重ねる。
// 実行: node scripts/number-ranges-svg.ts  →  docs/number-ranges.svg
import { writeFileSync } from 'node:fs'

const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
const ROWS = 13
const COLS = 100
const CW = 8
const RH = 20
const LX = 40
const TY = 52
const C = {
  bg: '#ffffff',
  grid: '#e3e6ec',
  text: '#1c1f26',
  text2: '#6a707c',
  c999: '#3b82f6',
  cdate: '#16a34a',
  chhmm: '#ea8a1a',
}

const x = (c: number) => LX + c * CW
const y = (r: number) => TY + r * RH
const W = LX + COLS * CW + 12
const H = TY + ROWS * RH + 12
const pad2 = (n: number) => String(n).padStart(2, '0')

const gridLines = [
  ...Array.from(
    { length: ROWS + 1 },
    (_, r) =>
      `<line x1="${x(0)}" y1="${y(r)}" x2="${x(COLS)}" y2="${y(r)}" stroke="${
        C.grid
      }"/>`
  ),
  ...Array.from(
    { length: COLS / 10 + 1 },
    (_, i) =>
      `<line x1="${x(i * 10)}" y1="${y(0)}" x2="${x(i * 10)}" y2="${y(
        ROWS
      )}" stroke="${C.grid}"/>`
  ),
]
const colTicks = Array.from(
  { length: COLS / 10 },
  (_, i) =>
    `<text x="${x(i * 10) + 2}" y="${TY - 7}" font-size="10" fill="${
      C.text2
    }">${pad2(i * 10)}</text>`
)
const edgeTicks = (
  [
    [31, C.cdate],
    [59, C.chhmm],
  ] as const
).map(
  ([c, col]) =>
    // 00 / 10 … の目盛りと重ならないよう 1 段上に置く
    `<text x="${x(c + 1)}" y="${
      TY - 21
    }" font-size="10" font-weight="700" text-anchor="end" fill="${col}">〜${c}</text>`
)
const rowLabels = Array.from(
  { length: ROWS },
  (_, r) =>
    `<text x="${LX - 6}" y="${
      y(r) + RH / 2 + 4
    }" font-size="10" text-anchor="end" fill="${C.text2}">${
      r === 0 ? '0xx' : `${r}xx`
    }</text>`
)
const datePoints = [
  [x(1), y(1)],
  ...DAYS.flatMap((d, i) => [
    [x(d + 1), y(i + 1)],
    [x(d + 1), y(i + 2)],
  ]),
  [x(1), y(13)],
]
  .map((p) => p.join(','))
  .join(' ')

const legend = (
  [
    [C.c999, 0.18, '999 (000〜999)', ''],
    [C.cdate, 0.3, '日付 mdd (101〜1231)', ''],
    [
      C.chhmm,
      0.14,
      '時刻 hhmm (0000〜1259、12 時間制)',
      ' stroke-dasharray="4 2"',
    ],
  ] as const
).map(
  ([col, op, text, dash], i) =>
    `<rect x="${
      LX + i * 230
    }" y="8" width="12" height="12" rx="2" fill="${col}" fill-opacity="${op}" stroke="${col}" stroke-width="2"${dash}/>` +
    `<text x="${LX + i * 230 + 18}" y="18" font-size="12" fill="${
      C.text
    }">${text}</text>`
)

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" font-family="system-ui, sans-serif">
<rect width="${W}" height="${H}" fill="${C.bg}"/>
${legend.join('\n')}
${gridLines.join('\n')}
${colTicks.join('\n')}
${edgeTicks.join('\n')}
${rowLabels.join('\n')}
<rect x="${x(0)}" y="${y(0)}" width="${60 * CW}" height="${13 * RH}" fill="${
  C.chhmm
}" fill-opacity="0.14" stroke="${
  C.chhmm
}" stroke-width="2.5" stroke-dasharray="6 3"/>
<rect x="${x(0)}" y="${y(0)}" width="${COLS * CW}" height="${10 * RH}" fill="${
  C.c999
}" fill-opacity="0.18" stroke="${C.c999}" stroke-width="2.5"/>
<polygon points="${datePoints}" fill="${C.cdate}" fill-opacity="0.3" stroke="${
  C.cdate
}" stroke-width="2.5"/>
<text x="${x(99) - 4}" y="${
  y(0) + 14
}" font-size="12" font-weight="700" text-anchor="end" fill="${
  C.c999
}">999</text>
<text x="${x(12)}" y="${y(12) + 14}" font-size="12" font-weight="700" fill="${
  C.cdate
}">日付 (12xx まで)</text>
<text x="${x(59) - 4}" y="${
  y(12) + 14
}" font-size="12" font-weight="700" text-anchor="end" fill="${
  C.chhmm
}">時刻 hhmm (1259 まで)</text>
</svg>
`

const out = new URL('../docs/number-ranges.svg', import.meta.url)
writeFileSync(out, svg)
console.log(`wrote ${out.pathname}`)
