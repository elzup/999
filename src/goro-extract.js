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
 * スロットに触れる全トークンを読みとして連結し、各トークンが枠外へはみ出す側に
 * ブラケットを付けて融合を表す: 手前(min より左)へはみ出す = 'K]' / 後ろ(max より右)
 * へはみ出す = '[K' / 両側 = と][ま のように内側で隣接。
 * kind: 'double'(2文字1トークン) | 'single'(1文字x2) | 'partial'(先頭0省略) | 'fused'
 */
export function extractGoro(toks, P) {
  const pset = new Set(P)
  const minP = Math.min(...P)
  const maxP = Math.max(...P)
  const items = [] // { text, pos, span }
  const filled = new Set()
  let fused = false

  const spanIn = (start, end) => {
    let span = 0
    for (let p = start; p <= end; p++) {
      if (pset.has(p)) {
        filled.add(p)
        span++
      }
    }
    return span
  }

  for (const t of toks) {
    let touches = false
    for (let p = t.start; p <= t.end; p++) {
      if (pset.has(p)) {
        touches = true
        break
      }
    }
    if (!touches) continue

    const chars = [...t.kana]
    const valLen = t.end - t.start + 1
    const fullyIn = t.start >= minP && t.end <= maxP

    if (fullyIn) {
      // 枠内に収まるユニット（ま=00, ふん=20 等）はそのまま
      items.push({ text: t.kana, pos: t.start, span: spanIn(t.start, t.end) })
    } else if (chars.length === valLen) {
      // カナ数=桁数で分割可能 → 枠内の文字だけ採用（枠外は捨てる、ブラケット無し）
      chars.forEach((ch, i) => {
        const pos = t.start + i
        if (pset.has(pos)) {
          filled.add(pos)
          items.push({ text: ch, pos, span: 1 })
        }
      })
    } else {
      // 1カナ=複数桁で分割不能。枠をまたぐ向きにブラケットを付けて丸ごと表示
      let text = t.kana
      if (t.start < minP) text = `${text}]` // 手前(左)へはみ出す
      if (t.end > maxP) text = `[${text}` // 後ろ(右)へはみ出す
      items.push({ text, pos: t.start, span: spanIn(t.start, t.end) })
      fused = true
    }
  }

  const omitted = P.filter((p) => !filled.has(p)).length
  items.sort((a, b) => a.pos - b.pos)
  const key =
    (omitted ? '_'.repeat(omitted) : '') + items.map((i) => i.text).join('')

  const kind = fused
    ? 'fused'
    : omitted
    ? 'partial'
    : items.length === 1 && items[0].span === 2
    ? 'double'
    : 'single'
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
