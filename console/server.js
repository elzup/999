// 画像管理コンソールのローカル API サーバ。
//   GET  /api/state        words + manifest + candidates + redo を merge して返す
//   POST /api/redo {num,slot,on}  word-images-redo.json を更新
//   静的: console/index.html, console/app.js
// ※ ファイル書込が必要なので静的ホスティング(bayalhost)では動かない。ローカル運用専用。

import { spawnSync } from 'node:child_process'
import { createReadStream, readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  PATHS,
  loadCandidates,
  loadManifest,
  loadRedo,
  loadKeep,
  writeJson,
  slotKey,
} from '../src/images/store.js'
import { downloadImage } from '../src/images/download.js'
import { toWebp, toWebpTop, hashKey } from '../src/images/process.js'
import { uploadWebp } from '../src/images/upload.js'
import { ddgSearchImage } from '../src/images/ddg.js'

const here = dirname(fileURLToPath(import.meta.url))
const repoRoot = join(here, '..')
const wordsPath = join(repoRoot, 'src', 'data', 'words.tsv')
const PORT = Number(process.env.PORT || 5999)

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
}

function loadWords() {
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

// 多候補スキーマ (wh1-3=人 / wm1-3=物) を console 旧スロット (w1/w2/w1_2/w2_2)
// にマップする。keep/manifest は旧キーで保存済みのため、その対応を維持する。
// 注意: wh3/wm3 (3 候補目) は現状の旧 4 枠模型には載らないため未表示。
function toLegacySlots(w) {
  return {
    num: w.num,
    w1: w.w1 || w.wh1,
    w1k: w.w1k || w.wh1k,
    w2: w.w2 || w.wm1,
    w2k: w.w2k || w.wm1k,
    w1_2: w.w1_2 || w.wh2,
    w2_2: w.w2_2 || w.wm2,
  }
}

/** gallery 用の state を組み立てる (静的ビルドからも再利用) */
export function buildState() {
  const words = loadWords()
    .map(toLegacySlots)
    .filter((w) => w.w1 || w.w2)
  const manifest = loadManifest()
  const candidates = loadCandidates()
  const redo = loadRedo()
  const keep = loadKeep()
  return {
    words,
    images: manifest.images || {},
    candidates: candidates.items || {},
    redo: redo.redo || {},
    keep: keep.keep || {},
  }
}

function setKeep({ num, slot, on }) {
  const keep = loadKeep()
  const key = slotKey(num, slot)
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

function setRedo({ num, slot, on, reason }) {
  const redo = loadRedo()
  const key = slotKey(num, slot)
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

/** その語だけ redo フラグ→再検索(前回URL除外)→再取得し、新しい画像を返す */
function redoNow({ num, slot }) {
  setRedo({ num, slot, on: true })
  const run = (script, args) =>
    spawnSync('node', [join('src', script), ...args], {
      cwd: repoRoot,
      encoding: 'utf-8',
    })
  // 1. 再検索 (--redo は flag 付きのみ、--nums/--slot で対象を絞る)
  run('search-word-images.js', [
    '--redo',
    '--nums',
    num,
    '--slot',
    slot,
    '--limit',
    '5',
  ])
  // 2. 再取得 (--redo-only。成功で redo フラグは自動クリア)
  run('fetch-word-images.js', ['--redo-only'])

  const img = loadManifest().images?.[num]?.[slot] || null
  const stillFlagged = Boolean(loadRedo().redo?.[slotKey(num, slot)])
  return { image: img, ok: Boolean(img) && !stillFlagged }
}

/** 元画像(sourceImageUrl)から上寄せでクロップし直して差し替える */
async function recropTop({ num, slot }) {
  const manifest = loadManifest()
  const cur = manifest.images?.[num]?.[slot]
  if (!cur?.sourceImageUrl) return { ok: false, error: '元画像URLが無い' }
  try {
    const { buffer } = await downloadImage(cur.sourceImageUrl)
    const webp = await toWebpTop(buffer)
    const { hash, key } = hashKey(webp)
    const { url } = await uploadWebp(webp, key)
    if (!manifest.images[num]) manifest.images[num] = {}
    manifest.images[num][slot] = {
      ...cur,
      url,
      hash,
      uploadedAt: new Date().toISOString(),
    }
    writeJson(PATHS.manifest, manifest)
    return { ok: true, image: manifest.images[num][slot] }
  } catch (err) {
    return { ok: false, error: String(err.message || err).slice(0, 200) }
  }
}

/** 任意の検索ワードで画像を取得して差し替える (未取得スロットの救済にも) */
async function searchCustom({ num, slot, query }) {
  if (!query || !query.trim()) return { ok: false, error: '検索ワードが空' }
  try {
    const r = await ddgSearchImage(query.trim(), [], true)
    if (!r?.imageUrl) return { ok: false, error: '見つからない' }
    const { buffer } = await downloadImage(r.imageUrl)
    const webp = await toWebp(buffer)
    const { hash, key } = hashKey(webp)
    const { url } = await uploadWebp(webp, key)
    const manifest = loadManifest()
    if (!manifest.images[num]) manifest.images[num] = {}
    manifest.images[num][slot] = {
      url,
      hash,
      sourcePage: r.sourcePage || '',
      sourceImageUrl: r.imageUrl,
      uploadedAt: new Date().toISOString(),
    }
    writeJson(PATHS.manifest, manifest)
    return { ok: true, image: manifest.images[num][slot] }
  } catch (err) {
    return { ok: false, error: String(err.message || err).slice(0, 200) }
  }
}

/** manifest の画像を指定のものに差し替える (2択の戻し用) */
function setImage({ num, slot, image }) {
  const manifest = loadManifest()
  if (!manifest.images[num]) manifest.images[num] = {}
  manifest.images[num][slot] = image
  writeJson(PATHS.manifest, manifest)
  return { ok: true, image }
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (req.method === 'GET' && url.pathname === '/api/state') {
    return sendJson(res, 200, buildState())
  }
  if (req.method === 'POST' && url.pathname === '/api/redo') {
    const body = await readBody(req)
    if (!body.num || !body.slot)
      return sendJson(res, 400, { error: 'num/slot required' })
    return sendJson(res, 200, { redo: setRedo(body) })
  }
  if (req.method === 'POST' && url.pathname === '/api/redo-now') {
    const body = await readBody(req)
    if (!body.num || !body.slot)
      return sendJson(res, 400, { error: 'num/slot required' })
    return sendJson(res, 200, redoNow(body))
  }
  if (req.method === 'POST' && url.pathname === '/api/keep') {
    const body = await readBody(req)
    if (!body.num || !body.slot)
      return sendJson(res, 400, { error: 'num/slot required' })
    return sendJson(res, 200, { keep: setKeep(body) })
  }
  if (req.method === 'POST' && url.pathname === '/api/recrop') {
    const body = await readBody(req)
    if (!body.num || !body.slot)
      return sendJson(res, 400, { error: 'num/slot required' })
    return sendJson(res, 200, await recropTop(body))
  }
  if (req.method === 'POST' && url.pathname === '/api/set-image') {
    const body = await readBody(req)
    if (!body.num || !body.slot || !body.image)
      return sendJson(res, 400, { error: 'num/slot/image required' })
    return sendJson(res, 200, setImage(body))
  }
  if (req.method === 'POST' && url.pathname === '/api/search-custom') {
    const body = await readBody(req)
    if (!body.num || !body.slot)
      return sendJson(res, 400, { error: 'num/slot required' })
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
  server.listen(PORT, () => {
    console.log(`console: http://localhost:${PORT}`)
  })
}
