import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import { handleNumbersRequest } from './numbers-route.js'
import {
  deriveSessionKey,
  handlePasskeyRequest,
  resolveAuth,
} from './passkey-route.js'

const EDIT_TOKEN = defineSecret('EDIT_TOKEN')
const GOOGLE_SERVICE_ACCOUNT_JSON = defineSecret('GOOGLE_SERVICE_ACCOUNT_JSON')

const DEFAULT_SHEET_URL =
  'https://docs.google.com/spreadsheets/d/1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM/edit?gid=0#gid=0'
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const SHEET_SCOPES = ['https://www.googleapis.com/auth/spreadsheets']

const CATEGORY_HEADERS = {
  hito: ['hito', '人'],
  mono: ['mono', '物'],
  gainen: ['gainen', '概念'],
}

const SLOT_HEADERS = {
  wh1: ['wh1', 'w1'],
  wh1k: ['wh1k', 'w1k'],
  wh1Img: ['wh1Img', 'w1Img'],
  wh2: ['wh2', 'w1_2'],
  wh2k: ['wh2k'],
  wh2Img: ['wh2Img', 'w1_2Img'],
  wh3: ['wh3'],
  wh3k: ['wh3k'],
  wh3Img: ['wh3Img'],
  wm1: ['wm1', 'w2'],
  wm1k: ['wm1k', 'w2k'],
  wm1Img: ['wm1Img', 'w2Img'],
  wm2: ['wm2', 'w2_2'],
  wm2k: ['wm2k'],
  wm2Img: ['wm2Img', 'w2_2Img'],
  wm3: ['wm3'],
  wm3k: ['wm3k'],
  wm3Img: ['wm3Img'],
}

const PATCH_ALIASES = {
  w1: 'wh1',
  w1k: 'wh1k',
  w1Img: 'wh1Img',
  w1_2: 'wh2',
  w1_2Img: 'wh2Img',
  w2: 'wm1',
  w2k: 'wm1k',
  w2Img: 'wm1Img',
  w2_2: 'wm2',
  w2_2Img: 'wm2Img',
}

const REGION = process.env.FUNCTION_REGION || 'asia-northeast1'

// シートで直した分を Firestore へ、アプリで直した分をシートへ流す (D-0022)。
// 数分の遅れは個人用途で許容できる。アプリ保存は PATCH の直後に即時でも流す
export const sheetSync = onSchedule(
  {
    schedule: 'every 5 minutes',
    region: REGION,
    secrets: [GOOGLE_SERVICE_ACCOUNT_JSON],
    // 初回と 1 日 1 回の全件読みは 1000 件を読むので既定の 60 秒では心許ない
    timeoutSeconds: 300,
  },
  async () => {
    const result = await runSheetSync()
    console.log('sheetSync', JSON.stringify(result.counts))
  }
)

export const api = onRequest(
  {
    region: REGION,
    secrets: [EDIT_TOKEN, GOOGLE_SERVICE_ACCOUNT_JSON],
  },
  async (req, res) => {
    setNoStore(res)

    if (req.method === 'OPTIONS') {
      res.status(204).send('')
      return
    }

    try {
      const path = normalizeApiPath(req.path)
      const editToken = EDIT_TOKEN.value()
      // 通行証の署名鍵は合言葉から作る。未設定のまま固定値で署名すると
      // 誰でも通行証を作れてしまうので、設定漏れは全経路を止める
      if (!editToken) {
        const error = new Error('edit_token_unset')
        error.statusCode = 500
        throw error
      }
      const passkeyCtx = {
        key: deriveSessionKey(editToken),
        store: passkeyStore,
        now: Date.now(),
      }
      const auth = await resolveAuth({
        ...passkeyCtx,
        bearer: getBearerToken(req),
        editToken,
      })

      // ログイン (パスキー認証) は未認証で叩く経路なので、認証必須の判定より前
      const passkeyResult = await handlePasskeyRequest({
        ...passkeyCtx,
        method: req.method,
        path,
        body: req.body || {},
        auth,
        rp: passkeyRp(),
        webauthn: path.startsWith('/auth/') ? await loadWebAuthn() : null,
      })
      if (passkeyResult) {
        res.status(passkeyResult.status).json(passkeyResult.payload)
        return
      }

      requireAuth(auth)

      if (req.method === 'GET' && path === '/editor/session') {
        res.json({ ok: true })
        return
      }

      // 辞書本体 (私的連想 + 画像URL)。認証済みブラウザだけが取得できる。
      if (req.method === 'GET' && path === '/app/data') {
        res.json(readPrivateJson('data.json'))
        return
      }

      // 統計ページ (visualize-words) 用データ。同じく私的語を含むため認証必須。
      if (req.method === 'GET' && path === '/app/stats') {
        res.json(readPrivateJson('visualize-words.data.json'))
        return
      }

      if (req.method === 'GET' && path === '/editor/words') {
        const sheet = await loadWordsSheet()
        res.json({ ok: true, words: sheet.entries })
        return
      }

      const saveMatch = path.match(/^\/editor\/words\/(\d{3})$/)
      if (req.method === 'PATCH' && saveMatch) {
        const result = await updateWordRow(saveMatch[1], req.body || {})
        res.json({ ok: true, word: result.entry })
        return
      }

      // 番号 1 件の読み書き (spec:number-api)。統合ビューはここだけを見る
      const numberMatch = path.match(/^\/numbers\/(\d{3})$/)
      if (numberMatch) {
        const { db, writes } = await loadFirestoreLib()
        const { status, payload } = await handleNumbersRequest({
          method: req.method,
          num: numberMatch[1],
          body: req.body || {},
          db,
          writes,
          now: new Date().toISOString(),
        })
        // 保存が通ったらその番号だけ即時にシートへ流す。失敗しても保存は
        // 巻き戻さない (Firestore が正本の 1 つなので、定期の回が拾い直す)
        if (req.method === 'PATCH' && status === 200) {
          await runSheetSync({ only: [numberMatch[1]] }).catch((error) =>
            console.error('sheetSync(only)', numberMatch[1], error)
          )
        }
        res.status(status).json(payload)
        return
      }

      if (req.method === 'GET' && path === '/sync/status') {
        const { store, syncHealth } = await loadSheetSync()
        const state = (await store.readState()) ?? null
        res.json({ ok: true, state, health: syncHealth(state, Date.now()) })
        return
      }

      if (req.method === 'POST' && path === '/sync/sheet') {
        const result = await runSheetSync()
        res.json({
          ok: true,
          counts: result.counts,
          conflicts: result.conflicts,
        })
        return
      }

      res.status(404).json({ ok: false, error: 'not_found' })
    } catch (error) {
      const status = Number(error.statusCode || 500)
      console.error(error)
      res.status(status).json({
        ok: false,
        error: status >= 500 ? 'internal_error' : error.message,
      })
    }
  }
)

// functions/lib は scripts/sync-functions-lib.sh が作る src/ の写し (ESM)。
// 初回に触ったリクエストでだけ読む。Sheets しか使わない経路に Firestore の
// 初期化コストを負わせないため、モジュールごと遅延させる
let firestoreLib = null
async function loadFirestoreLib() {
  if (!firestoreLib) {
    const [{ connect }, writes] = await Promise.all([
      import('./lib/firestore/db.js'),
      import('./lib/firestore/console-writes.js'),
    ])
    // Cloud Functions の ADC はこの関数のサービスアカウントを指す。
    // .firebaserc は同梱されないので projectId は実行環境から取る
    const projectId =
      process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT
    firestoreLib = { db: connect({ projectId }), writes }
  }
  return firestoreLib
}

let sheetSyncLib = null
async function loadSheetSync() {
  if (!sheetSyncLib) {
    const [
      { db },
      { createBisyncStore },
      { createSheetIo, writeStatusTab },
      { runBisync },
      status,
    ] = await Promise.all([
      loadFirestoreLib(),
      import('./lib/firestore/bisync-store.js'),
      import('./lib/firestore/sheet-io.js'),
      import('./lib/firestore/sheet-bisync-run.js'),
      import('./lib/firestore/sync-status.js'),
    ])
    sheetSyncLib = {
      store: createBisyncStore(db),
      createSheetIo,
      writeStatusTab,
      runBisync,
      ...status,
    }
  }
  return sheetSyncLib
}

async function runSheetSync({ only } = {}) {
  const lib = await loadSheetSync()
  const { store } = lib
  const { spreadsheetId, gid } = parseSpreadsheetUrl(
    process.env.SHEET_URL || DEFAULT_SHEET_URL
  )
  const now = new Date().toISOString()
  try {
    const title = await getSheetTitleByGid(spreadsheetId, gid)
    const sheet = lib.createSheetIo({ sheetsApi, spreadsheetId, title })
    return await lib.runBisync({ sheet, store, now, only })
  } catch (error) {
    // 定期の失敗はログにしか出ず気づけないので、状態に残してアプリとシートに見せる
    const state = await store.readState()
    await store.writeState(lib.stateWithError(state, error, now))
    throw error
  } finally {
    // 即時反映の回は保存の応答を待たせないよう書かない (5 分以内に定期が書く)
    if (!only) await writeSheetStatus(lib, spreadsheetId)
  }
}

async function writeSheetStatus(lib, spreadsheetId) {
  try {
    const state = await lib.store.readState()
    await lib.writeStatusTab({
      sheetsApi,
      spreadsheetId,
      tab: lib.STATUS_TAB,
      rows: lib.statusRows(state),
    })
  } catch (error) {
    // 状態タブは見るためだけの写し。書けなくても同期の結果は変わらない
    console.error('sheetSync(status tab)', error)
  }
}

// パスキーはドメインに結び付く。firebaseapp.com 側や独自ドメインから開くと
// 認証器が別サイトとして扱うので、ここに並べた origin でしか登録・ログインできない
const DEFAULT_RP_ID = 'anoz-memosupo.web.app'

function passkeyRp() {
  const id = process.env.PASSKEY_RP_ID || DEFAULT_RP_ID
  const origins = (process.env.PASSKEY_ORIGINS || `https://${id}`)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean)
  return { id, origins }
}

let webauthnLib = null
async function loadWebAuthn() {
  webauthnLib ??= await import('@simplewebauthn/server')
  return webauthnLib
}

const PASSKEYS = 'passkeys'

// 登録済みパスキーの公開鍵。Admin SDK でしか触らない (rules で全面拒否)。
// 合言葉だけで来るリクエストに Firestore の初期化を負わせないよう、触るまで繋がない
async function passkeyCollection() {
  const { db } = await loadFirestoreLib()
  return db.raw.collection(PASSKEYS)
}

const passkeyStore = {
  async get(id) {
    const snap = await (await passkeyCollection()).doc(id).get()
    return snap.exists ? snap.data() : undefined
  },
  set: async (id, doc) => (await passkeyCollection()).doc(id).set(doc),
  update: async (id, patch) =>
    (await passkeyCollection()).doc(id).update(patch),
  delete: async (id) => (await passkeyCollection()).doc(id).delete(),
  async list() {
    const snap = await (await passkeyCollection()).get()
    return snap.docs.map((d) => ({ id: d.id, doc: d.data() }))
  },
}

function setNoStore(res) {
  res.set('cache-control', 'no-store')
  res.set('vary', 'authorization')
}

const privateJsonCache = new Map()

// functions/private/<name> をデプロイ時に同梱し、fs で読む (キャッシュ)。
// 公開 hosting には置かず、この認証付き関数経由でのみ配信する。
function readPrivateJson(name) {
  if (!privateJsonCache.has(name)) {
    try {
      // ESM なので __dirname は無い。name は呼び出し側の固定文字列だけ
      const path = new URL('./private/' + name, import.meta.url)
      const raw = readFileSync(path, 'utf8')
      privateJsonCache.set(name, JSON.parse(raw))
    } catch (cause) {
      const error = new Error('private_data_unavailable')
      error.statusCode = 500
      throw error
    }
  }
  return privateJsonCache.get(name)
}

function normalizeApiPath(path) {
  return String(path || '').replace(/^\/api(?=\/)/, '') || '/'
}

function requireAuth(auth) {
  if (!auth) {
    const error = new Error('unauthorized')
    error.statusCode = 401
    throw error
  }
}

function getBearerToken(req) {
  const header = String(req.get('authorization') || '')
  const match = header.match(/^Bearer\s+(.+)$/i)
  return match?.[1]?.trim() || ''
}

async function updateWordRow(num, patch) {
  const sheet = await loadWordsSheet()
  const rowIndex = sheet.rows.findIndex((row) => row[sheet.index.num] === num)
  if (rowIndex === -1) {
    const error = new Error('word_not_found')
    error.statusCode = 404
    throw error
  }

  const row = [...sheet.rows[rowIndex]]
  const updates = []
  const current = rowToEntry(row, sheet.index)
  const next = { ...current, ...normalizePatch(patch) }

  if ('hito' in patch) {
    writeField(
      row,
      sheet.index,
      CATEGORY_HEADERS.hito,
      normalizeCell(next.hito),
      updates,
      sheet.title,
      rowIndex
    )
  }

  if ('mono' in patch || 'gainen' in patch) {
    const monoValue = mergeConceptFields(next.mono, next.gainen)
    writeField(
      row,
      sheet.index,
      CATEGORY_HEADERS.mono,
      monoValue,
      updates,
      sheet.title,
      rowIndex
    )
    writeField(
      row,
      sheet.index,
      CATEGORY_HEADERS.gainen,
      '',
      updates,
      sheet.title,
      rowIndex
    )
  }

  for (const field of Object.keys(SLOT_HEADERS)) {
    if (!(field in patch)) continue
    writeField(
      row,
      sheet.index,
      SLOT_HEADERS[field],
      normalizeCell(next[field]),
      updates,
      sheet.title,
      rowIndex
    )
  }

  if (updates.length === 0) {
    return { entry: rowToEntry(row, sheet.index) }
  }

  await sheetsApi(`/${sheet.spreadsheetId}/values:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'RAW',
      data: updates,
    }),
  })

  return { entry: rowToEntry(row, sheet.index) }
}

function normalizeCell(value) {
  if (value === null || value === undefined) return ''
  return String(value).replace(/\r?\n/g, ' ').trim()
}

function parseTaggedItems(raw) {
  if (!raw) return []

  let lastBase = ''
  return String(raw)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((label) => {
      const tags = [...label.matchAll(/#([^\s#,]+)/g)].map((match) => match[1])
      const uniqueTags = [...new Set(tags)]
      const ownBase = label.replace(/#([^\s#,]+)/g, '').trim()
      if (ownBase) lastBase = ownBase
      const base = ownBase || lastBase
      return { label, base, tags: uniqueTags }
    })
}

function serializeTaggedItems(items) {
  return items
    .map((item) => {
      const base = String(item?.base || '').trim()
      const tags = [...new Set(item?.tags || [])]
        .filter(Boolean)
        .map((tag) => String(tag).replace(/^#/, ''))
      return `${base}${tags.map((tag) => `#${tag}`).join('')}`.trim()
    })
    .filter(Boolean)
    .join(',')
}

function mergeConceptFields(monoRaw, gainenRaw = '') {
  const monoItems = parseTaggedItems(monoRaw)
  const gainenItems = parseTaggedItems(gainenRaw).map((item) => ({
    ...item,
    tags: [...new Set([...item.tags.filter((tag) => tag !== 'g'), 'g'])],
  }))
  return serializeTaggedItems([...monoItems, ...gainenItems])
}

function splitConceptFields(monoRaw, gainenRaw = '') {
  const monoItems = parseTaggedItems(monoRaw)
  const gainenItems = parseTaggedItems(gainenRaw).map((item) => ({
    ...item,
    tags: [...new Set([...item.tags.filter((tag) => tag !== 'g'), 'g'])],
  }))

  return {
    mono: serializeTaggedItems([...monoItems, ...gainenItems]),
    gainen: '',
  }
}

function normalizePatch(patch) {
  const out = {}
  for (const [key, value] of Object.entries(patch || {})) {
    const canonical = PATCH_ALIASES[key] || key
    out[canonical] = value
  }
  return out
}

function writeField(row, index, headers, value, updates, title, rowIndex) {
  for (const header of [...new Set(headers)]) {
    const colIndex = index[header]
    if (colIndex === undefined) continue
    row[colIndex] = value
    updates.push({
      range: `${title}!${columnName(colIndex + 1)}${rowIndex + 2}`,
      values: [[value]],
    })
  }
}

async function loadWordsSheet() {
  const { spreadsheetId, gid } = parseSpreadsheetUrl(
    process.env.SHEET_URL || DEFAULT_SHEET_URL
  )
  const title = await getSheetTitleByGid(spreadsheetId, gid)
  const values = await getSheetValuesByTitle(spreadsheetId, title)
  if (values.length === 0) {
    const error = new Error('empty_sheet')
    error.statusCode = 500
    throw error
  }

  const headers = values[0].map((value) => String(value || '').trim())
  const index = headerIndex(headers)
  if (index.num === undefined) {
    index.num = 0
  }

  const rows = values.slice(1).map((row) => normalizeRow(row, headers.length))
  const entries = rows
    .map((row) => rowToEntry(row, index))
    .filter((entry) => /^\d{3}$/.test(entry.num))

  return { spreadsheetId, title, headers, index, rows, entries }
}

function normalizeRow(row, width) {
  return Array.from({ length: width }, (_, index) => String(row[index] || ''))
}

function rowToEntry(row, index) {
  const monoRaw = cell(row, pickIndex(index, CATEGORY_HEADERS.mono))
  const gainenRaw = cell(row, pickIndex(index, CATEGORY_HEADERS.gainen))
  const split = splitConceptFields(monoRaw, gainenRaw)

  return {
    num: cell(row, index.num),
    hito: cell(row, pickIndex(index, CATEGORY_HEADERS.hito)),
    mono: split.mono,
    gainen: split.gainen,
    wh1: cell(row, pickIndex(index, ['wh1', 'w1'])),
    wh1k: cell(row, pickIndex(index, ['wh1k', 'w1k'])),
    wh1Img: cell(row, pickIndex(index, ['wh1Img', 'w1Img'])),
    wh2: cell(row, pickIndex(index, ['wh2', 'w1_2'])),
    wh2k: cell(row, pickIndex(index, ['wh2k'])),
    wh2Img: cell(row, pickIndex(index, ['wh2Img', 'w1_2Img'])),
    wh3: cell(row, pickIndex(index, ['wh3'])),
    wh3k: cell(row, pickIndex(index, ['wh3k'])),
    wh3Img: cell(row, pickIndex(index, ['wh3Img'])),
    wm1: cell(row, pickIndex(index, ['wm1', 'w2'])),
    wm1k: cell(row, pickIndex(index, ['wm1k', 'w2k'])),
    wm1Img: cell(row, pickIndex(index, ['wm1Img', 'w2Img'])),
    wm2: cell(row, pickIndex(index, ['wm2', 'w2_2'])),
    wm2k: cell(row, pickIndex(index, ['wm2k'])),
    wm2Img: cell(row, pickIndex(index, ['wm2Img', 'w2_2Img'])),
    wm3: cell(row, pickIndex(index, ['wm3'])),
    wm3k: cell(row, pickIndex(index, ['wm3k'])),
    wm3Img: cell(row, pickIndex(index, ['wm3Img'])),
    w1: cell(row, pickIndex(index, ['wh1', 'w1'])),
    w1k: cell(row, pickIndex(index, ['wh1k', 'w1k'])),
    w1Img: cell(row, pickIndex(index, ['wh1Img', 'w1Img'])),
    w1_2: cell(row, pickIndex(index, ['wh2', 'w1_2'])),
    w1_2Img: cell(row, pickIndex(index, ['wh2Img', 'w1_2Img'])),
    w2: cell(row, pickIndex(index, ['wm1', 'w2'])),
    w2k: cell(row, pickIndex(index, ['wm1k', 'w2k'])),
    w2Img: cell(row, pickIndex(index, ['wm1Img', 'w2Img'])),
    w2_2: cell(row, pickIndex(index, ['wm2', 'w2_2'])),
    w2_2Img: cell(row, pickIndex(index, ['wm2Img', 'w2_2Img'])),
  }
}

function cell(row, index) {
  return index === undefined ? '' : String(row[index] || '').trim()
}

function pickIndex(index, names) {
  for (const name of names) {
    if (index[name] !== undefined) return index[name]
  }
  return undefined
}

function headerIndex(headers) {
  const index = {}
  headers.forEach((header, i) => {
    if (index[header] === undefined) index[header] = i
  })
  return index
}

function parseSpreadsheetUrl(url) {
  const match = String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) throw new Error('invalid_sheet_url')

  const gidMatch = String(url || '').match(/[?#&]gid=(\d+)/)
  return {
    spreadsheetId: match[1],
    gid: gidMatch?.[1] || '0',
  }
}

async function getSheetTitleByGid(spreadsheetId, gid) {
  const data = await sheetsApi(
    `/${spreadsheetId}?fields=sheets(properties(sheetId,title))`
  )
  const sheet = data.sheets?.find(
    (entry) => String(entry.properties?.sheetId) === String(gid)
  )
  if (!sheet) throw new Error('sheet_not_found')
  return sheet.properties.title
}

async function getSheetValuesByTitle(spreadsheetId, title) {
  const data = await sheetsApi(
    `/${spreadsheetId}/values/${encodeURIComponent(title)}`
  )
  return data.values || []
}

async function sheetsApi(path, init = {}) {
  const accessToken = await getServiceAccountAccessToken()
  const res = await fetch(`${GOOGLE_SHEETS_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`sheets_api_error: ${res.status} ${text}`)
  }

  if (res.status === 204) return null
  return res.json()
}

async function getServiceAccountAccessToken() {
  const credentials = JSON.parse(GOOGLE_SERVICE_ACCOUNT_JSON.value())
  const now = Math.floor(Date.now() / 1000)
  const assertion = signJwt(
    {
      iss: credentials.client_email,
      scope: SHEET_SCOPES.join(' '),
      aud: GOOGLE_TOKEN_URL,
      exp: now + 3600,
      iat: now,
    },
    normalizePrivateKey(credentials.private_key)
  )

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(`google_token_error: ${res.status} ${text}`)
  }

  const json = await res.json()
  return json.access_token
}

function signJwt(payload, privateKey) {
  const header = { alg: 'RS256', typ: 'JWT' }
  const unsignedToken = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload)
  )}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsignedToken)
  signer.end()
  const signature = signer.sign(privateKey)
  return `${unsignedToken}.${base64url(signature)}`
}

function normalizePrivateKey(privateKey) {
  return String(privateKey || '').replace(/\\n/g, '\n')
}

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function columnName(index) {
  let current = index
  let name = ''
  while (current > 0) {
    const remainder = (current - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    current = Math.floor((current - 1) / 26)
  }
  return name || 'A'
}
