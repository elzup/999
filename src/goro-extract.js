import { loadWords } from './words.js'
import { encode } from './encoder.js'

const TARGET_DIGITS = 3

/** num -> w1k の Map（3桁番号のみ） */
export function loadByNum() {
  const byNum = new Map()
  for (const e of loadWords()) {
    if (/^\d{3}$/.test(e.num)) byNum.set(e.num, e.w1k)
  }
  return byNum
}

/** 3桁番号エントリ一覧（w1k/w2k 等を含む） */
export function loadEntries() {
  return loadWords().filter((e) => /^\d{3}$/.test(e.num))
}

/** かな1語を位置集合 P で分類。語が無ければ null。 */
export function classify(kana, P) {
  const tok = tokenize(kana)
  if (tok.status === 'none') return null
  if (tok.status === 'error') return { key: '(error)', kind: 'error' }
  return extractGoro(tok.toks, P)
}

/**
 * w1k をトークン化し、各トークンに数字位置 [start,end] を割り当てる。
 * 桁不足（先頭0省略）は左パディングして右詰めに揃える。
 */
export function tokenize(w1k) {
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
 * 位置集合 P（固定2桁）を覆うゴロを抽出し、種別も返す。
 * kind: 'double'(2文字1トークン) | 'single'(1文字x2) | 'partial'(先頭0省略) | 'fused'
 */
export function extractGoro(toks, P) {
  const pset = new Set(P)
  const collected = []
  const covered = new Set()

  for (const t of toks) {
    const inN = []
    for (let p = t.start; p <= t.end && p <= 2; p++) {
      covered.add(p)
      inN.push(p)
    }
    const inP = inN.filter((p) => pset.has(p))
    const outP = inN.filter((p) => !pset.has(p))
    if (inP.length === 0) continue
    // 固定2桁の片側が枠外の桁と1トークンに融合 → そのカナで分類
    if (outP.length > 0) return { key: `融合:${t.kana}`, kind: 'fused' }
    collected.push(t.kana)
  }

  const omitted = P.filter((p) => !covered.has(p)).length
  const key = (omitted ? '_'.repeat(omitted) : '') + collected.join('')
  const kind = omitted ? 'partial' : collected.length === 1 ? 'double' : 'single'
  return { key, kind }
}

function bump(dist, key, kind) {
  const cur = dist.get(key) ?? { count: 0, kind }
  cur.count += 1
  dist.set(key, cur)
}

/**
 * group ごとに { key -> {count, kind} } を集計。
 * kanasFn(entry) は対象スロットのかな配列（例: [w1k, w2k]）を返す。
 * スロットが全て空の番号は (none) として 1 計上する。
 */
export function analyzeGroups(entries, groupKeyFn, kanasFn, P) {
  const groups = new Map()
  for (const e of entries) {
    const gk = groupKeyFn(e.num)
    if (!groups.has(gk)) groups.set(gk, new Map())
    const dist = groups.get(gk)

    const kanas = kanasFn(e).filter(Boolean)
    if (kanas.length === 0) {
      bump(dist, '(none)', 'none')
      continue
    }
    for (const kana of kanas) {
      const g = classify(kana, P)
      if (g) bump(dist, g.key, g.kind)
    }
  }
  return groups
}
