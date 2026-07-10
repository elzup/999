// 判断ステップ (トークン不使用版): Google Custom Search Image API で
// 各 w1/w2 の直リンク画像 URL を探し、word-images.candidates.json に書く。
// その後 `nr images:fetch` が DL→webp→GCS upload する (既存パイプライン)。
//
// 必要: .config/cse-api-key.txt (API キー) と CSE_CX (検索エンジン ID)。
//   env: CSE_API_KEY / CSE_CX で上書き可。
// 使い方:
//   CSE_CX=xxxx nr images:search                 # w1 を未取得から順に (既定 limit 90)
//   CSE_CX=xxxx node src/search-word-images.js --slot both --limit 200
//   CSE_CX=xxxx node src/search-word-images.js --redo   # redo flag のみ再検索

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildSearchWord } from './images/query.js'
import { ddgSearchImage } from './images/ddg.js'
import {
  PATHS,
  loadCandidates,
  loadRedo,
  loadKeep,
  isKept,
  writeJson,
  slotKey,
} from './images/store.js'
// wh/wm 多候補スキーマを w1/w2/w1_2/w2_2 に正規化する共有ローダを使う
// (旧ローカル loadWords は tsv 生カラムのままで _2 スロットを拾えなかった)
import { loadWords } from './words.js'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data')

function arg(flag, def) {
  const i = process.argv.indexOf(flag)
  return i >= 0 ? process.argv[i + 1] : def
}
const SLOT = arg('--slot', 'w1') // w1 | w2 | both
const LIMIT = Number(arg('--limit', '90'))
const REDO_ONLY = process.argv.includes('--redo')
const RETAG = process.argv.includes('--retag') // タグ展開で検索語が変わる分を再検索
const REQUERY = process.argv.includes('--requery') // 保存済みクエリと変わった語を再検索
const PROVIDER = arg('--provider', 'ddg') // ddg (キー不要) | cse
const SAFE = !process.argv.includes('--unsafe') // セーフサーチ (既定 ON)
const NUMS = arg('--nums', '') // "008,017,025" のように対象を絞る (テスト用)
const numSet = NUMS ? new Set(NUMS.split(',').map((s) => s.trim())) : null

function loadTagMap() {
  const p = join(dataDir, 'tags.json')
  return existsSync(p) ? JSON.parse(readFileSync(p, 'utf-8')) : {}
}
const tagMap = loadTagMap()

function readKey() {
  if (process.env.CSE_API_KEY) return process.env.CSE_API_KEY
  const p = join(dataDir, '..', '..', '.config', 'cse-api-key.txt')
  if (existsSync(p)) return readFileSync(p, 'utf-8').trim()
  throw new Error(
    'CSE API key not found (.config/cse-api-key.txt or CSE_API_KEY)'
  )
}
function readCx() {
  const cx = process.env.CSE_CX
  if (!cx) throw new Error('CSE_CX (search engine id) is required')
  return cx
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** CSE で画像1枚を探す。見つからなければ null。 */
async function searchImage(query, key, cx) {
  const url =
    `https://www.googleapis.com/customsearch/v1?key=${key}&cx=${cx}` +
    `&searchType=image&num=5&safe=off&q=${encodeURIComponent(query)}`
  const res = await fetch(url)
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`CSE ${res.status}: ${body.slice(0, 200)}`)
  }
  const data = await res.json()
  const items = data.items || []
  // mime が image/ で、html ページでない直リンクを優先
  const pick =
    items.find((it) => (it.mime || '').startsWith('image/')) || items[0]
  if (!pick) return null
  return { imageUrl: pick.link, sourcePage: pick.image?.contextLink || '' }
}

const ALL_SLOTS = ['w1', 'w2', 'w1_2', 'w2_2']
function targetSlots() {
  if (SLOT === 'all') return ALL_SLOTS
  if (SLOT === 'both') return ['w1', 'w2']
  return [SLOT]
}

async function searchOne(query, ctx, rejected = []) {
  if (PROVIDER === 'cse') return searchImage(query, ctx.key, ctx.cx)
  return ddgSearchImage(query, rejected, SAFE)
}

async function main() {
  const ctx = {}
  if (PROVIDER === 'cse') {
    ctx.key = readKey()
    ctx.cx = readCx()
  }
  const words = loadWords()
  const candidates = loadCandidates()
  const redo = loadRedo()
  const keep = loadKeep()

  // 処理対象 (num, slot, word) を組み立て
  const jobs = []
  for (const w of words) {
    if (numSet && !numSet.has(w.num)) continue
    for (const slot of targetSlots()) {
      const word = w[slot]
      if (!word) continue
      const k = slotKey(w.num, slot)
      const flagged = Boolean(redo.redo?.[k])
      if (REDO_ONLY && !flagged) continue
      // ロック画像は (明示 redo でない限り) 再検索しない
      if (isKept(keep, w.num, slot) && !flagged) continue
      // --retag: タグ展開で検索語が変わる語だけ対象 (改善見込みのある分)
      if (RETAG) {
        const changed =
          buildSearchWord(word, tagMap) !== buildSearchWord(word, {})
        if (!changed) continue
      }
      const existing = candidates.items[k]
      // --requery: 保存済みクエリと現在の生成クエリが変わった語だけ対象
      if (REQUERY) {
        if (buildSearchWord(word, tagMap) === existing?.query) continue
      }
      // 既に found 済み & redo/retag/requery でないなら skip
      if (
        !REDO_ONLY &&
        !RETAG &&
        !REQUERY &&
        existing?.status === 'found' &&
        !flagged
      )
        continue
      jobs.push({ num: w.num, slot, word, key: k })
    }
  }

  let found = 0
  let miss = 0
  let n = 0
  for (const job of jobs) {
    if (n >= LIMIT) break
    n++
    const query = buildSearchWord(job.word, tagMap)
    try {
      const prev = candidates.items[job.key]
      const rejected = prev?.rejectedUrls || []
      // redo / DL失敗(error) の再取得時は前回URLを除外して別画像を狙う
      const retrying = job.key in (redo.redo || {}) || prev?.status === 'error'
      if (retrying && prev?.imageUrl && !rejected.includes(prev.imageUrl)) {
        rejected.push(prev.imageUrl)
      }
      const r = await searchOne(query, ctx, rejected)
      candidates.items[job.key] = {
        num: job.num,
        slot: job.slot,
        word: job.word,
        query,
        imageUrl: r?.imageUrl || '',
        sourcePage: r?.sourcePage || '',
        status: r ? 'found' : 'not_found',
        rejectedUrls: rejected,
        pickedAt: new Date().toISOString(),
      }
      if (r) {
        found++
        console.log(`  ${job.key} "${query}" -> found`)
      } else {
        miss++
        console.log(`  ${job.key} "${query}" -> not_found`)
      }
      if (n % 25 === 0) writeJson(PATHS.candidates, candidates) // 定期保存
    } catch (err) {
      console.error(`  ${job.key} ERROR: ${err.message}`)
      // quota 超過等は中断 (無料枠 100/日)
      if (String(err.message).match(/429|quota|rateLimit|dailyLimit/i)) {
        console.error('  -> quota/rate limit. stopping.')
        break
      }
    }
    await sleep(PROVIDER === 'ddg' ? 800 : 300) // pacing (ddg は rate limit 回避)
  }

  writeJson(PATHS.candidates, candidates)
  console.log(
    `\nprovider=${PROVIDER} searched=${n} found=${found} not_found=${miss} (slot=${SLOT}, limit=${LIMIT})`
  )
  console.log('next: nr images:fetch  (DL→webp→GCS upload)')
}

main().catch((err) => {
  console.error(err.message)
  process.exit(1)
})
