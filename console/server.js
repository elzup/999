// 画像管理コンソールのローカル API サーバ。
//   GET  /api/state        対象 (番号・日付・カード) + manifest + candidates + redo を merge して返す
//   POST /api/redo {id,slot,on}  word-images-redo.json を更新
//   静的: console/index.html, console/app.js
// 画像データの正本は Firestore imageSlots (spec:image-store)。手元の JSON は cache で、
// API の前後で syncImages() が送受信する。
// ※ ファイル書込が必要なので静的ホスティング(bayalhost)では動かない。ローカル運用専用。

import { spawnSync } from 'node:child_process'
import { createReadStream, existsSync, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PATHS,
  loadCandidates,
  loadManifest,
  loadRedo,
  loadKeep,
  isKept,
  writeJson,
  slotKey,
} from '../src/images/store.js'
import { downloadImage } from '../src/images/download.js'
import { toWebpTop, hashKey } from '../src/images/process.js'
import { uploadWebp } from '../src/images/upload.js'
import {
  CANONICAL_SLOT,
  IMAGE_KINDS,
  PIPELINE_SLOTS,
  kindOf,
} from '../src/images/targets.js'
import {
  loadTargets,
  redoDirect,
  searchAndStore,
} from '../src/images/direct.js'
import { buildAvatarImage } from '../src/avatar-i-images.js'
import { parseSlot } from '../src/images/tag-variants.js'
import { extractName } from '../src/words.js'
import { syncImages, syncOnStart } from '../src/images/image-sync.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const PORT = Number(process.env.PORT || 5999)

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
}

// タグの正式名 (res → ライザのアトリエ)。sync:tags の出力。検索ワードの展開に使う。無い手元では名前なしで動く
function loadTagNames() {
  const path = join(repoRoot, 'src', 'data', 'tags.json')
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
}

// タグの略称 (short_title)。表示はこちらを先に使う
function loadTagShorts() {
  const path = join(repoRoot, 'src', 'data', 'tags-short.json')
  return existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
}

/** gallery 用の state を組み立てる (静的ビルドからも再利用) */
export function buildState() {
  const manifest = loadManifest()
  const candidates = loadCandidates()
  const redo = loadRedo()
  const keep = loadKeep()
  return {
    kinds: IMAGE_KINDS,
    slotNames: CANONICAL_SLOT,
    targets: loadTargets(),
    images: manifest.images || {},
    candidates: candidates.items || {},
    redo: redo.redo || {},
    keep: keep.keep || {},
    tagNames: loadTagNames(),
    tagShorts: loadTagShorts(),
  }
}

function setKeep({ id, slot, on }) {
  const keep = loadKeep()
  const key = slotKey(id, slot)
  if (on) keep.keep[key] = true
  else delete keep.keep[key]
  writeJson(PATHS.keep, keep)
  return keep.keep
}

function sendJson(res, code, obj) {
  const body = JSON.stringify(obj)
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(body)
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'))
      } catch {
        resolve({})
      }
    })
  })
}

function setRedo({ id, slot, on, reason }) {
  const redo = loadRedo()
  const key = slotKey(id, slot)
  if (on) {
    redo.redo[key] = {
      flaggedAt: new Date().toISOString(),
      reason: reason || '',
    }
  } else {
    delete redo.redo[key]
  }
  writeJson(PATHS.redo, redo)
  return redo.redo
}

/** 子プロセスの失敗を握り潰さず、原因を1行に畳んで返す */
function runScript(script, args) {
  const r = spawnSync('node', [join('src', script), ...args], {
    cwd: repoRoot,
    encoding: 'utf-8',
  })
  if (r.error) return `${script}: ${r.error.message}`
  if (r.status !== 0) {
    // stderr の最終行が原因であることが多い (throw のメッセージ)
    const lines = String(r.stderr || '')
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
    const why = lines.find((l) => /Error|error|失敗/.test(l)) || lines.at(-1)
    return `${script} が exit ${r.status}: ${(why || '出力なし').slice(0, 160)}`
  }
  return null
}

/**
 * その語だけ取り直し、新しい画像を返す。
 * 番号は一括パイプライン (search/fetch スクリプト) に通す。日付・カードはスクリプトが
 * words.tsv しか読まないため、ここで語から検索ワードを作って直接取りに行く。
 */
async function redoNow({ id, slot }) {
  // 3 番目 (wh3 / wm3) とタグ違いの枠 (w1_2#res) は一括パイプラインが知らないので、
  // 日付・カードと同じく直接取る
  if (kindOf(id) !== 'num' || !PIPELINE_SLOTS.includes(slot)) {
    const result = await redoDirect({ id, slot })
    // 番号は fetch スクリプトが成功時に印を消す。日付・カードはここで消す
    if (result.ok) setRedo({ id, slot, on: false })
    return result
  }
  setRedo({ id, slot, on: true })
  // 1. 再検索 (--redo は flag 付きのみ、--nums/--slot で対象を絞る)
  const searchError = runScript('search-word-images.js', [
    '--redo',
    '--nums',
    id,
    '--slot',
    slot,
    '--limit',
    '5',
  ])
  if (searchError) return { ok: false, error: searchError }
  // 2. 再取得 (--redo-only。成功で redo フラグは自動クリア)
  const fetchError = runScript('fetch-word-images.js', [
    '--redo-only',
    '--only',
    slotKey(id, slot),
  ])
  if (fetchError) return { ok: false, error: fetchError }

  const img = loadManifest().images?.[id]?.[slot] || null
  const stillFlagged = Boolean(loadRedo().redo?.[slotKey(id, slot)])
  if (!img) return { ok: false, error: '検索したが画像が見つからなかった' }
  if (stillFlagged)
    return { ok: false, error: '取得に失敗し redo フラグが残っている' }
  return { image: img, ok: true }
}

/** 元画像(sourceImageUrl)から上寄せでクロップし直して差し替える */
async function recropTop({ id, slot }) {
  const manifest = loadManifest()
  const cur = manifest.images?.[id]?.[slot]
  if (!cur?.sourceImageUrl) return { ok: false, error: '元画像URLが無い' }
  try {
    const { buffer } = await downloadImage(cur.sourceImageUrl)
    const webp = await toWebpTop(buffer)
    const { hash, key } = hashKey(webp)
    const { url } = await uploadWebp(webp, key)
    if (!manifest.images[id]) manifest.images[id] = {}
    manifest.images[id][slot] = {
      ...cur,
      url,
      hash,
      uploadedAt: new Date().toISOString(),
    }
    writeJson(PATHS.manifest, manifest)
    return { ok: true, image: manifest.images[id][slot] }
  } catch (err) {
    return { ok: false, error: String(err.message || err).slice(0, 200) }
  }
}

/** 任意の検索ワードで画像を取得して差し替える (未取得スロットの救済にも) */
async function searchCustom({ id, slot, query }) {
  if (!query || !query.trim()) return { ok: false, error: '検索ワードが空' }
  return searchAndStore({ id, slot, query: query.trim() })
}

/** manifest の画像を指定のものに差し替える (2択の戻し用) */
function setImage({ id, slot, image }) {
  const manifest = loadManifest()
  if (!manifest.images[id]) manifest.images[id] = {}
  manifest.images[id][slot] = image
  writeJson(PATHS.manifest, manifest)
  return { ok: true, image }
}

/**
 * #i 枠のアバターをいまの語の名前で作り直して確定する。
 * #i は実写を出さない枠なので console では他の操作を出さず、語 (名前) が変わると
 * 名札が古いまま直す手段が無かった (nr images:avatar-i の全件実行しかない)
 */
async function remakeAvatar({ id, slot }) {
  const word = loadTargets().find((t) => t.id === id)?.[slot]
  if (!word || !/#i\b/.test(word))
    return { ok: false, error: '#i の枠ではない' }
  const seed = extractName(word)
  if (!seed) return { ok: false, error: '語から名前が取れない' }
  try {
    const { image } = await buildAvatarImage(seed)
    setImage({ id, slot, image })
    return { ok: true, image, keep: setKeep({ id, slot, on: true }) }
  } catch (e) {
    console.error(`avatar ${id}:${slot}`, e)
    return { ok: false, error: String(e.message || e) }
  }
}

// ID の形式を変えた後も古い画面が開いたままだと、旧形式の ID (例 SA) で書き込まれ、
// 新形式 (AS) から見えない記録が残る。種類の分からない ID・枠は受け付けない
const INVALID_TARGET = 'id/slot が不正です。画面を再読み込みしてください'
const LOCKED = 'ロック中の枠です。取り直すならロックを外してから'
// タグ違いの枠 (w1_2#res) は、いまの語にそのタグがあるときだけ通す (語を直した後の古い画面から書かせない)
const isValidTarget = ({ id, slot }) => {
  if (typeof slot !== 'string') return false
  const kind = kindOf(id)
  if (!kind || !IMAGE_KINDS[kind].slots.includes(parseSlot(slot).base))
    return false
  if (!parseSlot(slot).tag) return true
  return Boolean(
    loadTargets()
      .find((t) => t.id === id)
      ?.slots.includes(slot)
  )
}

// 同期は 1 本ずつ。並べないと 2 つの同期が同じ base を読んで同じ枠を二度送る
let syncQueue = Promise.resolve()
function queueSync(when) {
  syncQueue = syncQueue.then(() =>
    syncImages().then(
      (r) => {
        if (r.pushed || r.pulled)
          console.log(
            `  画像の同期 (${when}): 送信 ${r.pushed} / 取り込み ${r.pulled}`
          )
      },
      // 落とさない: 送れなかった変更は手元に残り、base との差分として次の同期で再送される
      (err) => console.error(`✗ 画像の同期に失敗 (${when})`, err)
    )
  )
  return syncQueue
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)
  // 読む前に web など別の面の更新を取り込む。書いた後の送信は応答を返してから行う
  if (url.pathname.startsWith('/api/')) {
    await queueSync('前')
    if (req.method === 'POST') res.on('finish', () => queueSync('後'))
  }

  // 別サイトのページからの書き込み (CSRF) を断る。application/json の POST は
  // ブラウザが事前確認を挟み、この server は CORS を返さないので他所からは送れない
  const ct = req.headers['content-type'] || ''
  if (req.method === 'POST' && !ct.startsWith('application/json'))
    return sendJson(res, 415, { error: 'content-type は application/json' })

  if (req.method === 'GET' && url.pathname === '/api/state') {
    return sendJson(res, 200, buildState())
  }
  if (req.method === 'POST' && url.pathname === '/api/redo') {
    const body = await readBody(req)
    if (!isValidTarget(body))
      return sendJson(res, 400, { error: INVALID_TARGET })
    // ロック中の枠に印を付けると、次の一括の取り直しで上書きされる。取り直すならロックを外してから
    if (body.on && isKept(loadKeep(), body.id, body.slot))
      return sendJson(res, 409, { error: LOCKED })
    return sendJson(res, 200, { redo: setRedo(body) })
  }
  if (req.method === 'POST' && url.pathname === '/api/redo-now') {
    const body = await readBody(req)
    if (!isValidTarget(body))
      return sendJson(res, 400, { error: INVALID_TARGET })
    return sendJson(res, 200, await redoNow(body))
  }
  if (req.method === 'POST' && url.pathname === '/api/keep') {
    const body = await readBody(req)
    if (!isValidTarget(body))
      return sendJson(res, 400, { error: INVALID_TARGET })
    return sendJson(res, 200, { keep: setKeep(body) })
  }
  if (req.method === 'POST' && url.pathname === '/api/avatar') {
    const body = await readBody(req)
    if (!isValidTarget(body))
      return sendJson(res, 400, { error: INVALID_TARGET })
    return sendJson(res, 200, await remakeAvatar(body))
  }
  if (req.method === 'POST' && url.pathname === '/api/recrop') {
    const body = await readBody(req)
    if (!isValidTarget(body))
      return sendJson(res, 400, { error: INVALID_TARGET })
    return sendJson(res, 200, await recropTop(body))
  }
  if (req.method === 'POST' && url.pathname === '/api/set-image') {
    const body = await readBody(req)
    if (!isValidTarget(body) || !body.image)
      return sendJson(res, 400, { error: INVALID_TARGET })
    return sendJson(res, 200, setImage(body))
  }
  if (req.method === 'POST' && url.pathname === '/api/search-custom') {
    const body = await readBody(req)
    if (!isValidTarget(body))
      return sendJson(res, 400, { error: INVALID_TARGET })
    return sendJson(res, 200, await searchCustom(body))
  }

  // static
  const name = url.pathname === '/' ? '/index.html' : url.pathname
  const file = join(here, name)
  if (!file.startsWith(here)) {
    res.writeHead(403)
    return res.end('forbidden')
  }
  const stream = createReadStream(file)
  stream.on('error', () => {
    // ファイルが無い等。ヘッダ未送信なら 404 (二重送信を防ぐ)
    if (!res.headersSent) {
      res.writeHead(404)
      res.end('not found')
    } else {
      res.destroy()
    }
  })
  // ファイルが開けてからヘッダを書く (open 後なら error は来ない)
  stream.on('open', () => {
    res.writeHead(200, {
      'content-type': MIME[extname(file)] || 'application/octet-stream',
    })
    stream.pipe(res)
  })
})

// 直接実行時のみ listen (build-static.js から import される時は起動しない)
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // 書き込み API に認証が無いので、同じ LAN の他の端末からは受け付けない
  // つながらなくても cache で起動する (変更は次の同期で送る)。一度も同期していない端末だけ止める
  if (!(await syncOnStart('console'))) process.exit(1)
  server.listen(PORT, '127.0.0.1', () => {
    console.log(`console: http://localhost:${PORT}`)
  })
}
