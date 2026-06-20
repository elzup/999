import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadWords } from './words.js'
import { encode } from './encoder.js'

const TARGET_DIGITS = 3

/**
 * w1k をトークン化し、各トークンに数字位置 [start, end] を割り当てる。
 * 桁不足（先頭0省略）の場合は左をパディングして右詰めに揃える。
 */
function tokenize(w1k) {
  if (!w1k) return { status: 'none' }
  let enc
  try {
    enc = encode(w1k)
  } catch {
    return { status: 'error' }
  }
  const offset = Math.max(0, TARGET_DIGITS - enc.digits.length)
  let pos = offset
  const toks = enc.tokens.map((t) => {
    const start = pos
    const end = pos + t.value.length - 1
    pos += t.value.length
    return { kana: t.kana, start, end }
  })
  return { status: 'ok', toks }
}

/**
 * 位置集合 P（0..2 のうち固定2桁）を覆うかなゴロを抽出する。
 * - P 内・外の両方をまたぐトークン → 融合（fused）
 * - P 内の位置がトークンに覆われない → 先頭0省略（_ で表す）
 */
function extractGoro(toks, P) {
  const pset = new Set(P)
  const collected = []
  const covered = new Set()

  for (const t of toks) {
    for (let p = t.start; p <= t.end && p <= 2; p++) covered.add(p)
    const inN = []
    for (let p = t.start; p <= t.end && p <= 2; p++) inN.push(p)
    const inP = inN.filter((p) => pset.has(p))
    const outP = inN.filter((p) => !pset.has(p))
    if (inP.length === 0) continue
    if (outP.length > 0) return { fused: true }
    collected.push({ kana: t.kana, start: t.start })
  }

  const omitted = P.filter((p) => !covered.has(p)).length
  collected.sort((a, b) => a.start - b.start)
  const key =
    (omitted ? '_'.repeat(omitted) : '') + collected.map((c) => c.kana).join('')
  return { fused: false, key }
}

/** 全 1000 番について P を抽出し、groupKey ごとに分布を集計する */
function analyze(byNum, groupKeyFn, P) {
  const groups = new Map()
  for (const [num, w1k] of byNum) {
    const gk = groupKeyFn(num)
    if (!groups.has(gk)) groups.set(gk, new Map())
    const dist = groups.get(gk)

    const tok = tokenize(w1k)
    let key
    if (tok.status === 'none') key = '(none)'
    else if (tok.status === 'error') key = '(error)'
    else {
      const g = extractGoro(tok.toks, P)
      key = g.fused ? '(融合)' : g.key
    }
    dist.set(key, (dist.get(key) ?? 0) + 1)
  }
  return groups
}

/** 分布マップを "ま=4, おん=4, ..." の降順文字列にする */
function formatDist(dist) {
  return [...dist.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, v]) => `${k}=${v}`)
    .join(', ')
}

function renderSection(title, desc, groups) {
  const lines = [`## ${title}`, '', desc, '']
  const keys = [...groups.keys()].sort()
  for (const gk of keys) {
    lines.push(`- \`${gk}\` ${formatDist(groups.get(gk))}`)
  }
  lines.push('')
  return lines.join('\n')
}

// ---------------------------------------------------------------------------

const words = loadWords()
const byNum = new Map()
for (const e of words) {
  if (/^\d{3}$/.test(e.num)) byNum.set(e.num, e.w1k)
}

const yz = analyze(byNum, (n) => n.slice(1), [1, 2]) // _YZ (X 可変)
const xy = analyze(byNum, (n) => n.slice(0, 2), [0, 1]) // XY_ (Z 可変)
const xz = analyze(byNum, (n) => n[0] + n[2], [0, 2]) // X_Z (Y 可変)

const out = [
  '# ゴロ割り当て分布統計',
  '',
  '`src/data/words.tsv` の w1k（第1単語の読み）を `encode()` でトークン化し、',
  '固定した2桁を覆うかなゴロの分布を集計したもの。`nr stats:goro` で再生成。',
  '',
  '- `(融合)`: 固定2桁の一方が、固定外の桁と1つのトークンに融合している（例: 2桁読みが境界をまたぐ）',
  '- 先頭 `_`: 先頭0省略によりその位置のかなが省かれている',
  '- `(none)`: w1k 未登録 / `(error)`: エンコード不能',
  '',
  renderSection(
    '_YZ — 下2桁 YZ（X を可変, 0YZ〜9YZ）',
    '各 YZ について、その下2桁を覆うゴロの分布。',
    yz
  ),
  renderSection(
    'XY_ — 上2桁 XY（Z を可変, XY0〜XY9）',
    '各 XY について、その上2桁を覆うゴロの分布。',
    xy
  ),
  renderSection(
    'X_Z — 両端 X・Z（Y を可変, X0Z〜X9Z）',
    '各 X_Z について、両端の桁を覆うゴロ（非隣接）の分布。',
    xz
  ),
].join('\n')

const docPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'docs',
  'goro-stats.md'
)
writeFileSync(docPath, out)
console.log(`wrote ${docPath}`)
console.log('\n--- sample: _YZ = 00 (= X00) ---')
console.log(formatDist(yz.get('00')))
console.log('--- sample: XY_ = 20 (= 20Z) ---')
console.log(formatDist(xy.get('20')))
console.log('--- sample: X_Z = 20 (= 2Y0) ---')
console.log(formatDist(xz.get('20')))
