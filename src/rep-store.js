// 代表語 (representative) 選択の永続化。各番号 000-999 について、代表を
// 候補(人 wh1-3 / 物 wm1-3)から順序付き最大2枠(①②)で記録する。
// 既定は [wh1(人トップ), wm1(物トップ)] だが、wh1+wh2 のような同種ペアも選べる。
//
// 保存はスロット位置(wh1等)ではなく「読み+語」の値で持つ(picks)。原本(words.tsv)
// の候補が並び替わっても代表はズレず、語そのものが消えた/変わった時だけ stale として
// 再確認を促す(黙って別語にすり替わらない)。
//
// さらに候補語 1 件ずつに主観評価 (-1/0/+1/+2) を持つ(scores)。scorer.js の機械スコア
// (pt) とは別軸で、「人間から見てこの語呂はアリか」を記録する。未評価(null)と 0(普通)
// は別状態として扱う。picks と同じく値(読み+語)で保存するので並び替えに強い。
//   word-rep.json:
//   { version:2,
//     rep:    { "051": { picks:[{k:"こい",w:"鯉"},{k:"らび",w:"ラビ#lom"}],
//                        confirmed:true } },
//     scores: { "051": [{k:"こい",w:"鯉",v:2},{k:"こいぬ",w:"子犬",v:-1}] } }

import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadManifest, readJson, writeJson } from './images/store.js'
import { scoreWithLabel } from './scorer.js'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data')
const wordsPath = join(dataDir, 'words.tsv')

export const REP_PATH = join(dataDir, 'word-rep.json')

// 表示順(人→物でグループ) / 既定の代表優先順(人トップ→物トップ→2番手…)
export const SLOT_ORDER = ['wh1', 'wh2', 'wh3', 'wm1', 'wm2', 'wm3']
export const DEFAULT_PRIORITY = ['wh1', 'wm1', 'wh2', 'wm2', 'wh3', 'wm3']
// 画像 manifest は旧スロットで保存(w1=人1, w1_2=人2, w2=物1, w2_2=物2)。人物3番手は無し。
const SLOT_IMG = { wh1: 'w1', wh2: 'w1_2', wm1: 'w2', wm2: 'w2_2' }
const MAX_REP = 2

// 主観評価の許容値。未評価は null(キー自体を持たない)で、0(普通)とは区別する。
export const RATINGS = [-1, 0, 1, 2]
export const STORE_VERSION = 2

const slotKind = (slot) => (slot.startsWith('wh') ? 'hito' : 'mono')
const slotRank = (slot) => Number(slot.slice(2))

export function loadRep() {
  const store = readJson(REP_PATH, {})
  return { version: STORE_VERSION, rep: {}, scores: {}, ...store }
}

export function loadWordsTsv() {
  const text = readFileSync(wordsPath, 'utf-8')
  const lines = text.split('\n').filter((l) => l.trim() !== '')
  const header = lines[0].split('\t')
  return lines.slice(1).map((line) => {
    const cols = line.split('\t')
    const e = {}
    header.forEach((k, i) => {
      e[k] = cols[i]?.trim() || ''
    })
    return e
  })
}

/** 読みが埋まっている候補スロットを表示順で返す */
export function availableSlots(word) {
  return SLOT_ORDER.filter((s) => word[`${s}k`])
}

/** 未設定時の既定代表順: 優先順に存在する先頭2つ */
export function defaultOrder(word) {
  return DEFAULT_PRIORITY.filter((s) => word[`${s}k`]).slice(0, MAX_REP)
}

/** 候補がちょうど1つの場合だけ、選択余地がないので自動確定する。 */
export function isAutoConfirmed(word) {
  return availableSlots(word).length === 1
}

/** 候補の表示情報(語・読み・スコア・画像URL) */
function slotView(word, slot, imagesForNum) {
  const w = word[slot] || ''
  const k = word[`${slot}k`] || ''
  if (!k) return null
  const imgSlot = SLOT_IMG[slot]
  return {
    slot,
    kind: slotKind(slot),
    rank: slotRank(slot),
    word: w,
    k,
    score: scoreWithLabel(k, w).score,
    img: (imgSlot && imagesForNum?.[imgSlot]?.url) || null,
  }
}

/** picks(値) を現在の候補スロットに解決する。マッチしないものは stale。*/
function resolvePicks(word, picks) {
  const avail = availableSlots(word)
  const order = []
  const stale = []
  const used = new Set()
  for (const p of picks || []) {
    const slot = avail.find(
      (s) =>
        !used.has(s) && word[`${s}k`] === p.k && (word[s] || '') === (p.w || '')
    )
    if (slot) {
      used.add(slot)
      order.push(slot)
    } else {
      stale.push(p)
    }
  }
  return { order: order.slice(0, MAX_REP), stale }
}

/** scores(値) を現在の候補スロットに解決する。マッチしないものは stale。*/
export function resolveRatings(word, list) {
  const avail = availableSlots(word)
  const rates = {}
  const stale = []
  for (const s of list || []) {
    const slot = avail.find(
      (x) =>
        rates[x] === undefined &&
        word[`${x}k`] === s.k &&
        (word[x] || '') === (s.w || '')
    )
    if (slot && RATINGS.includes(s.v)) rates[slot] = s.v
    else stale.push(s)
  }
  return { rates, stale }
}

/** entry(picks) or 既定 から代表順と stale を得る (gen とも共有) */
export function resolveOrder(word, entry) {
  if (entry && Array.isArray(entry.picks))
    return resolvePicks(word, entry.picks)
  return { order: defaultOrder(word), stale: [] }
}

/** order(スロット配列) を picks(値) に変換して保存形へ */
function orderToPicks(word, order) {
  const seen = new Set()
  return (order || [])
    .filter((s) => word[`${s}k`] && !seen.has(s) && (seen.add(s), true))
    .slice(0, MAX_REP)
    .map((s) => ({ k: word[`${s}k`], w: word[s] || '' }))
}

/** 全候補スコアの平均・標準偏差(偏差値の母集団) */
function scorePopulation(words) {
  const all = []
  for (const w of words)
    for (const s of availableSlots(w))
      all.push(scoreWithLabel(w[`${s}k`], w[s] || '').score)
  const n = all.length || 1
  const mean = all.reduce((a, b) => a + b, 0) / n
  const variance = all.reduce((a, b) => a + (b - mean) ** 2, 0) / n
  return { mean, std: Math.sqrt(variance) || 1 }
}

/** スコア → 偏差値(T得点) 0-100 に丸めクランプ */
function toDeviation(score, { mean, std }) {
  return Math.max(
    0,
    Math.min(100, Math.round(50 + (10 * (score - mean)) / std))
  )
}

/** UI 用の state を組み立てる */
export function buildRepState() {
  const store = loadRep()
  const rep = store.rep || {}
  const scores = store.scores || {}
  const images = loadManifest().images || {}
  const wordsRaw = loadWordsTsv()
  const pop = scorePopulation(wordsRaw)

  const words = wordsRaw.map((w) => {
    const { rates, stale: rateStale } = resolveRatings(w, scores[w.num])
    const cands = availableSlots(w)
      .map((s) => slotView(w, s, images[w.num]))
      .filter(Boolean)
      .map((c) => ({
        ...c,
        dev: toDeviation(c.score, pop),
        // 主観評価。未評価は null (0 と区別する)
        rate: c.slot in rates ? rates[c.slot] : null,
      }))
    const entry = rep[w.num]
    const { order, stale } = resolveOrder(w, entry)
    // 候補が 1 つなら選ぶ余地が無いので自動確定 (永続化はしない=原本更新に追従)
    const auto = isAutoConfirmed(w)
    const confirmed = auto || Boolean(entry?.confirmed)
    return {
      num: w.num,
      cands, // [{slot,kind,rank,word,k,score,dev,img,rate}] 人→物
      order, // 代表順 (スロット配列, 最大2)
      confirmed,
      auto, // 自動確定 (単一候補)
      stale, // 原本更新で消えた/変わった pick (あれば要再確認)
      rateStale, // 原本更新で行き場を失った評価
      rated: cands.filter((c) => c.rate !== null).length,
    }
  })
  return { slots: SLOT_ORDER, pop, ratings: RATINGS, words }
}

/** 代表順・確定状態を保存する */
export function setRep(
  { num, order, confirmed },
  {
    loadStore = loadRep,
    loadWords = loadWordsTsv,
    writeStore = (nextStore) => writeJson(REP_PATH, nextStore),
  } = {}
) {
  const store = loadStore()
  const word = loadWords().find((w) => w.num === num)
  if (!word) return { error: 'unknown num' }
  if (!Array.isArray(order)) return { error: 'order must be an array' }
  if (typeof confirmed !== 'boolean')
    return { error: 'confirmed must be boolean' }

  const available = new Set(availableSlots(word))
  if (order.some((slot) => !available.has(slot))) {
    return { error: 'order contains unavailable slot' }
  }

  const normalizedOrder = [...new Set(order)]
  if (normalizedOrder.length > MAX_REP)
    return { error: `order must have at most ${MAX_REP} slots` }
  const entry = { picks: orderToPicks(word, normalizedOrder), confirmed }
  const nextStore = {
    ...store,
    version: STORE_VERSION,
    rep: {
      ...(store.rep || {}),
      [num]: entry,
    },
  }
  writeStore(nextStore)
  const { order: resolved } = resolveOrder(word, entry)
  return { num, order: resolved, confirmed }
}

/**
 * 候補語 1 件の主観評価を保存する。v=null で未評価に戻す。
 * 代表(picks)とは独立した軸なので、評価しても確定状態は動かさない。
 */
export function setScore(
  { num, slot, v },
  {
    loadStore = loadRep,
    loadWords = loadWordsTsv,
    writeStore = (nextStore) => writeJson(REP_PATH, nextStore),
  } = {}
) {
  const store = loadStore()
  const word = loadWords().find((w) => w.num === num)
  if (!word) return { error: 'unknown num' }
  if (!availableSlots(word).includes(slot)) return { error: 'unavailable slot' }
  if (v !== null && !RATINGS.includes(v)) return { error: 'invalid rating' }

  const key = { k: word[`${slot}k`], w: word[slot] || '' }
  // 同じ語を指す既存評価だけ落として置き換える (他スロットの評価は保つ)
  const kept = (store.scores?.[num] || []).filter(
    (s) => !(s.k === key.k && (s.w || '') === key.w)
  )
  const next = v === null ? kept : [...kept, { ...key, v }]
  const nextScores = { ...(store.scores || {}) }
  if (next.length) nextScores[num] = next
  else delete nextScores[num]

  writeStore({ ...store, version: STORE_VERSION, scores: nextScores })
  const { rates } = resolveRatings(word, next)
  return { num, slot, v: slot in rates ? rates[slot] : null, rates }
}
