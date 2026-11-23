// 登録語の読み方パターン一覧 (rankey の網羅確認用)。
// 語ごとに rankey・今の点 (scorer)・パターンのタグを付け、パターンで絞り込める HTML を作る。
// ラベル (-a / -m / -s / -j / -p) と機械判定の食い違いも «要確認» タグにする。
//
//   node scripts/rankey-catalog.mjs [data.json] > .metarc/rankey-catalog.data.json
//   FIRESTORE_ACCESS_TOKEN=... node scripts/rankey-catalog.mjs --db > ...   (DB の今の語を読む)
//
// data.json は配信データ (functions/private/data.json = 最後の nr deploy 時点の写し)
import { readFileSync } from 'node:fs'
import { rankey, leftoverOf } from '../src/rankey.js'
import { score, scoreWithLabel } from '../src/scorer.js'
import { hasNotation, parseNotation } from '../src/kana-notation.js'

const SLOTS = ['w1', 'w2', 'wh1', 'wh2', 'wh3', 'wm1', 'wm2', 'wm3']
const SMALL_YOUON = 'ゃゅょャュョ'
const SMALL_ANY = 'ぁぃぅぇぉゃゅょゎ'
const LABEL_RE = /(^|\s)-([a-z])(?=\s|#|,|$)/g

/**
 * 先頭の 0 の扱い (D-0113 / D-0114)。
 * 00X: 0 を省く = 0うめ省略 (1 つでも 2 つでも)、全部読む = 00X 0読み
 * 0XY: 0 を省く = 先頭0省略、0 を読む = X=0読み (評価は弱い)
 */
function zeroTags(num, rk) {
  if (num[0] !== '0') return []
  const omitted = (rk.match(/^_+/) || [''])[0].length
  if (num[1] === '0') return [omitted > 0 ? '0うめ省略' : '00X 0読み']
  return [omitted > 0 ? '先頭0省略' : 'X=0読み']
}

function bodyTags(num, kana, detail, rk) {
  const tags = []
  for (const t of detail.tokens) {
    if (t.type === 'overflow') continue
    if (t.type === 'single') tags.push(`1桁 ${t.tier ?? '?'}`)
    else if (t.type === 'sokuon') tags.push('促音')
    else if (t.type === 'half') tags.push('半指定')
    else if (t.type === 'halfOverflow') tags.push('境界またぎ')
    else if (t.type === 'double') {
      const ch = [...t.kana]
      if (ch.length === 1) tags.push('2桁 1文字')
      else if (SMALL_ANY.includes(ch[1]))
        tags.push(
          num[0] === '6' && /^[じジ]/.test(ch[0]) ? '2桁 ジ拗音' : '2桁 拗音'
        )
      else tags.push('2桁 2文字')
    }
  }
  tags.push(...zeroTags(num, rk))
  if (rk.includes('!'))
    tags.push(hasNotation(kana) ? '中間省略 (記法)' : '中間省略 (自動)')
  if (detail.youon4) tags.push('拗音4')
  if (detail.mix) tags.push('mix')
  return tags
}

function restTag(rest, rk) {
  const v = rk.split('|')[1].startsWith('v') ? 'またぎ+' : ''
  if (!rest) return v ? '余り: またぎのみ' : '余り: なし'
  const c = [...rest]
  let k
  if (rest === 'ん') k = 'ん'
  else if (rest === 'ー') k = 'ー'
  else if (c.length === 2 && c[0] === 'っ') k = 'っ+1字'
  else if (c.length === 2 && c[1] === 'ん') k = '1字+ん'
  else if (c.length === 2 && c[1] === 'ー') k = '1字+ー'
  else if (c.length === 2 && c[0] === 'ー') k = 'ー+1字'
  else if (c.length === 1 && SMALL_ANY.includes(rest)) k = '小書き1字'
  else if (c.length === 1 && 'あいうえお'.includes(rest)) k = '母音1字'
  else if (c.length === 1) k = '1字 その他'
  else if (c.length === 2) k = '2字 その他'
  else k = '3字以上'
  return `余り: ${v}${k}`
}

/** ラベルと機械判定の食い違い。どちらかが漏れている候補 */
function mismatchTags(labels, tags, rest, rk) {
  const has = (t) => tags.includes(t)
  const out = []
  const omit = has('中間省略 (記法)') || has('中間省略 (自動)')
  // -a (余りあり) は D-0120 で全部外した。余りは rankey の接尾とよみの + 語尾で見る
  if (labels.includes('m') !== has('mix'))
    out.push(
      labels.includes('m')
        ? '要確認: -m だが mix なし'
        : '要確認: mix だが -m なし'
    )
  if (labels.includes('s') && !omit) out.push('要確認: -s だが中間省略なし')
  if (!labels.includes('s') && omit && !labels.includes('j'))
    out.push('要確認: 中間省略だが -s なし')
  if (labels.includes('j') && !has('拗音4') && !omit)
    out.push('要確認: -j だが拗音4/省略なし')
  if (labels.includes('p') && has('先頭0省略'))
    out.push('要確認: -p だが先頭0省略')
  return out
}

/** DB の numbers/* を配信データと同じ {num, wh1, wh1k, …} の形にする */
async function readDb() {
  const { connectRest } = await import('../src/firestore/rest.js')
  const { SLOT_KEYS } = await import('../src/sheet-layout.js')
  const db = connectRest({
    projectId: 'anoz-memosupo',
    token: process.env.FIRESTORE_ACCESS_TOKEN,
  })
  const docs = await db.readAllNumbers()
  const numbers = Object.entries(docs)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([num, doc]) => ({
      num,
      ...Object.fromEntries(
        SLOT_KEYS.flatMap((key) => [
          [key, doc.slots?.[key]?.word ?? ''],
          [`${key}k`, doc.slots?.[key]?.kana ?? ''],
        ])
      ),
    }))
  return { numbers, slots: SLOT_KEYS }
}

async function main() {
  const fromDb = process.argv.includes('--db')
  const path = process.argv[2] ?? 'functions/private/data.json'
  const data = fromDb ? await readDb() : JSON.parse(readFileSync(path, 'utf8'))
  const slotKeys = data.slots ?? SLOTS
  const seen = new Set()
  const rows = []
  for (const e of data.numbers) {
    for (const slot of slotKeys) {
      const word = e[slot]
      const kana = e[`${slot}k`]
      if (!word || !kana) continue
      const key = `${e.num}|${word}|${kana}`
      if (seen.has(key)) continue
      seen.add(key)
      const labels = [...word.matchAll(LABEL_RE)].map((m) => m[2])
      const name = word
        .replace(LABEL_RE, ' ')
        .replace(/#[^\s,]+/g, '')
        .split(',')[0]
        .trim()
      const rk = rankey(kana, e.num, word)
      if (!rk) {
        rows.push([e.num, slot, name, kana, '', null, ['rankey 不可'], labels])
        continue
      }
      let detail
      try {
        detail = score(kana)
      } catch {
        rows.push([e.num, slot, name, kana, rk, null, ['scorer 不可'], labels])
        continue
      }
      const overflow = detail.tokens
        .filter((t) => t.type === 'overflow')
        .map((t) => t.kana)
        .join('')
      // 語尾をよみに書いてあれば (+ の後ろ、D-0122) それが余り。無ければ語から数える
      const tail = parseNotation(kana)
        .filter((seg) => seg.tail || seg.skip)
        .slice(-1)[0]
      const written = kana.includes('+') ? (tail?.hira ?? '') : ''
      const rest =
        overflow + (kana.includes('+') ? written : leftoverOf(word, kana) || '')
      const tags = bodyTags(e.num, kana, detail, rk)
      const all = [
        ...new Set(tags),
        restTag(rest, rk),
        ...labels.map((l) => `ラベル -${l}`),
        ...mismatchTags(labels, tags, rest, rk),
      ]
      rows.push([
        e.num,
        slot,
        name,
        kana,
        rk,
        scoreWithLabel(kana, word).score,
        all,
        labels,
      ])
    }
  }
  process.stdout.write(JSON.stringify(rows.map((r) => r.slice(0, 7))))
}

main()
