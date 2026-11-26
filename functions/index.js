import { createSign } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { onRequest } from 'firebase-functions/v2/https'
import { onSchedule } from 'firebase-functions/v2/scheduler'
import { defineSecret } from 'firebase-functions/params'
import {
  handleNumbersRangeRequest,
  handleNumbersRequest,
} from './numbers-route.js'
import {
  deriveSessionKey,
  handlePasskeyRequest,
  resolveAuth,
} from './passkey-route.js'
import { handleConsoleRequest } from './console-route.js'

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

// 旧 DB (numbers) と新しい形 (symbols / words) の毎晩の検査 (DB 計画 P3-7・P5-4)。
// 違反 (C1〜C9・形) と旧と新の食い違い (C7) を数え、meta/db4Check に残す。違反があれば error のログを出す。
// 読み取りは 1 回で約 4,500 (番号 1000 + 記号 1308 + 語 2225)。無料枠 5 万/日に収まる
export const db4Check = onSchedule(
  {
    schedule: 'every day 04:00',
    timeZone: 'Asia/Tokyo',
    region: REGION,
    timeoutSeconds: 300,
  },
  async () => {
    const [{ db }, { checkAll }] = await Promise.all([
      loadFirestoreLib(),
      import('./lib/db4/check-all.js'),
    ])
    const readAll = async (col) =>
      (await db.raw.collection(col).get()).docs.map((d) => ({
        id: d.id,
        ...d.data(),
      }))
    const [numbers, symbols, words] = await Promise.all([
      readAll('numbers'),
      readAll('symbols'),
      readAll('words'),
    ])
    const report = {
      ...checkAll({ numbers, symbols, words }),
      checkedAt: new Date().toISOString(),
    }
    await db.raw.collection('meta').doc('db4Check').set(report)
    if (report.ok) console.log('db4Check ok', JSON.stringify(report.counts))
    else console.error('db4Check NG', JSON.stringify(report))
  }
)

export const api = onRequest(
  {
    region: REGION,
    secrets: [EDIT_TOKEN, GOOGLE_SERVICE_ACCOUNT_JSON],
    // web 版 console の取り直し (/console/redo-now など) が画像の DL と sharp の変換を待つため
    memory: '1GiB',
    timeoutSeconds: 120,
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

      // web 版の画像コンソール (/console/)。画像と印は正本 imageSlots を直接読み書きする (spec:image-store)
      if (path.startsWith('/console/')) {
        const result = await handleConsoleRequest({
          method: req.method,
          path,
          body: req.body || {},
          state: await withLiveTargets(
            await withLiveSearchTagNames(readPrivateJson('console-state.json'))
          ),
          ...(await loadImageSlots()),
          now: new Date().toISOString(),
        })
        if (result) {
          res.status(result.status).json(result.payload)
          return
        }
      }

      if (req.method === 'GET' && path === '/editor/session') {
        res.json({ ok: true })
        return
      }

      // 辞書本体 (私的連想 + 画像URL)。認証済みブラウザだけが取得できる。
      if (req.method === 'GET' && path === '/app/data') {
        // 配信データは deploy のときの写し。アプリ・シートで直した語とタグ名は DB の最新を重ねる
        const data = await withLiveNumbers(readPrivateJson('data.json'))
        res.json(await withLiveTagNames(data))
        return
      }

      // 番号 1 件を配信データの形で返す。アプリが保存の後に、読み込み済みの一覧を差し替えるのに使う
      const entryMatch = path.match(/^\/app\/numbers\/(\d{3})$/)
      if (req.method === 'GET' && entryMatch) {
        const entry = await liveNumberEntry(entryMatch[1])
        if (!entry) {
          res.status(404).json({ ok: false, error: 'not_found' })
          return
        }
        res.json({ ok: true, entry })
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

      // 百の位 1 つぶんの読み取り (REQ-NAPI-008)。代表語ピッカーの一覧用
      if (path === '/numbers') {
        const { db } = await loadFirestoreLib()
        const { status, payload } = await handleNumbersRangeRequest({
          method: req.method,
          hundred: String(req.query?.hundred ?? ''),
          db,
        })
        res.status(status).json(payload)
        return
      }

      // 番号 1 件の読み書き (spec:number-api)。統合ビューはここだけを見る
      const numberMatch = path.match(/^\/numbers\/(\d{3})$/)
      if (numberMatch) {
        const { db, writes } = await loadFirestoreLib()
        // 語の並べ替え・削除・移動は、画像 (imageSlots) を語に付いて回らせるため書く前の slots を覚える
        const isSlots = req.method === 'PATCH' && req.body?.op === 'slots'
        const before = isSlots
          ? await handleNumbersRequest({
              method: 'GET',
              num: numberMatch[1],
              db,
            })
          : null
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
          // 語を消すと即時反映が枠を詰めて文書を書き直し、updatedAt が進む。
          // 書き直す前の文書を返すと、画面が古い updatedAt で次の保存をして 409 になる
          const latest = await handleNumbersRequest({
            method: 'GET',
            num: numberMatch[1],
            db,
          })
          // 即時反映が枠を詰め直すこともあるので、詰めた後の slots と突き合わせる
          if (isSlots && before?.status === 200) {
            await moveImageSlots({
              num: numberMatch[1],
              before: before.payload?.number?.slots ?? {},
              after:
                (latest.status === 200
                  ? latest.payload?.number?.slots
                  : payload?.number?.slots) ?? {},
              carry: Array.isArray(req.body.carry) ? req.body.carry : [],
            }).catch((error) =>
              console.error('moveImageSlots', numberMatch[1], error)
            )
          }
          res
            .status(status)
            .json(latest.status === 200 ? latest.payload : payload)
          return
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
let imageSlots = null

// 画像の正本 (imageSlots)。インスタンスが生きている間は全件をメモリに持ち、更新分だけ読み足す
// (slot-store.js)。numbers と違い writeNumber の不変条件は無いので、1 枠ずつ transaction で書く
async function loadImageSlots() {
  if (!imageSlots) {
    const [{ db }, store, docs] = await Promise.all([
      loadFirestoreLib(),
      import('./lib/images/slot-store.js'),
      import('./lib/images/slot-docs.js'),
    ])
    const slots = store.createSlotStore({
      col: db.raw.collection(docs.IMAGE_SLOTS),
      runTransaction: (fn) => db.raw.runTransaction(fn),
    })
    imageSlots = { slots, docs, fetcher: createImageFetcher() }
  }
  return imageSlots
}

/**
 * 番号の slots を書いた後に、画像の文書を語と同じ枠へ動かす (src/images/slot-moves.js)。
 * 失敗しても語の保存は巻き戻さない (画像が前の枠に残るだけ)
 */
async function moveImageSlots({ num, before, after, carry }) {
  const { slots } = await loadImageSlots()
  const moves = await import('./lib/images/slot-moves.js')
  const plan = moves.planSlotMoves(num, before, after, carry)
  if (plan.length === 0) return
  const now = new Date().toISOString()
  const docs = await slots.listSlots({ now })
  for (const write of moves.slotMoveWrites(num, plan, docs, now)) {
    await slots.update(write.id, write.slot, () => ({ doc: write.doc }))
  }
}

// 取り直し (検索 → DL → webp → GCS) の口。sharp を読むのは取り直しを叩いたときだけ。
// バケットはこの関数のサービスアカウント (ADC) で開く。Admin SDK の初期化は loadFirestoreLib が先に済ませている
function createImageFetcher() {
  let lib = null
  const load = async () => {
    if (!lib) {
      const [{ getStorage }, uploader, fetchOne, query] = await Promise.all([
        import('firebase-admin/storage'),
        import('./lib/images/uploader.js'),
        import('./lib/images/fetch-one.js'),
        import('./lib/images/query.js'),
      ])
      const { uploadWebp, saveOnce } = uploader.createUploader(() =>
        getStorage().bucket(uploader.BUCKET)
      )
      // 元画像は縮小版を作らずに 1 ファイルだけ上げる (切り抜き直しにしか使わない)
      lib = { uploadWebp, saveOriginal: saveOnce, fetchOne, query }
    }
    return lib
  }
  return {
    // tagMap は焼いた state の tagNames (略語タグ → 正式名)。Mac の search-word-images と同じ展開にする
    async queryOf(word, tagMap) {
      return (await load()).query.buildSearchWord(word, tagMap)
    },
    async bySearch({ query, rejected }) {
      const { uploadWebp, saveOriginal, fetchOne } = await load()
      return fetchOne.fetchBySearch({
        query,
        rejected,
        uploadWebp,
        saveOriginal,
      })
    },
    async candidates({ query, rejected }) {
      const { uploadWebp, saveOriginal, fetchOne } = await load()
      return fetchOne.fetchCandidates({
        query,
        rejected,
        uploadWebp,
        saveOriginal,
      })
    },
    async recrop({ image, position, rect }) {
      const { uploadWebp, saveOriginal, fetchOne } = await load()
      return fetchOne.recropAt({
        image,
        uploadWebp,
        saveOriginal,
        position,
        rect,
      })
    },
  }
}

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
      tagNames,
    ] = await Promise.all([
      loadFirestoreLib(),
      import('./lib/firestore/bisync-store.js'),
      import('./lib/firestore/sheet-io.js'),
      import('./lib/firestore/sheet-bisync-run.js'),
      import('./lib/firestore/sync-status.js'),
      import('./lib/firestore/tag-names.js'),
    ])
    sheetSyncLib = {
      store: createBisyncStore(db),
      tagNamesStore: tagNames.createTagNamesStore(db),
      tagNames,
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
    const result = await lib.runBisync({ sheet, store, now, only })
    // 即時反映の回 (only) は保存した番号だけが目的なので、タグ名は定期の回に任せる
    if (!only) await syncTagNamesSafely(lib, spreadsheetId, now)
    return result
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

async function syncTagNamesSafely(lib, spreadsheetId, now) {
  try {
    const { changed } = await lib.tagNames.syncTagNames({
      readValues: async () =>
        (
          await sheetsApi(
            `/${spreadsheetId}/values/${encodeURIComponent(
              lib.tagNames.TAG_NAMES_RANGE
            )}`
          )
        ).values ?? [],
      store: lib.tagNamesStore,
      now,
    })
    if (changed.length) console.log('sheetSync(tagNames)', changed.length)
  } catch (error) {
    // タグ名は表示名だけ。読めなくても語の同期の結果は変わらず、配信データの名前で出る
    console.error('sheetSync(tagNames)', error)
  }
}

/**
 * console の state のタグ名 (焼いた tags.json = tag → 正式名) に、シート同期で DB に置いた最新の正式名を重ねる。
 * 検索ワードの略語タグの展開 (#tri → トリッカル) に使うので、deploy 後にシートへ足したタグも効かせる
 */
async function withLiveSearchTagNames(state) {
  try {
    const lib = await loadSheetSync()
    const doc = await lib.tagNamesStore.read()
    if (!doc) return state
    return {
      ...state,
      // tagNames は検索用の正式名 (title)、tagShorts は表示用の略称 (short_title → title)
      tagNames: {
        ...(state.tagNames ?? {}),
        ...lib.tagNames.searchNamesOf(doc.names),
      },
      tagShorts: {
        ...(state.tagShorts ?? {}),
        ...lib.tagNames.displayNamesOf(doc.names),
      },
    }
  } catch (error) {
    // DB が読めなくても console は動かす。展開が deploy 時点の表になるだけ
    console.error('console(tagNames)', error)
    return state
  }
}

// 番号文書の写し。インスタンスが生きている間は全件をメモリに持ち、updatedAt が新しい文書だけ読み足す
// (/app/data を開くたびに約 1000 件を読まないため)。時計のずれを吸収するため少し重ねて読み直す
const NUMBER_PULL_OVERLAP_MS = 5 * 60 * 1000
let numberDocs = null

async function readNumberDocs() {
  const now = new Date().toISOString()
  const { store } = await loadSheetSync()
  if (!numberDocs) {
    numberDocs = { docs: await store.readChangedSince(null), pulledAt: now }
    return numberDocs.docs
  }
  const since = new Date(
    Date.parse(numberDocs.pulledAt) - NUMBER_PULL_OVERLAP_MS
  ).toISOString()
  numberDocs = {
    docs: { ...numberDocs.docs, ...(await store.readChangedSince(since)) },
    pulledAt: now,
  }
  return numberDocs.docs
}

let liveTargetsLib = null
const loadLiveTargetsLib = async () =>
  (liveTargetsLib ??= await import('./lib/images/live-targets.js'))

/**
 * console の対象 (焼いた state.targets) の番号の分を、DB の最新の語で作り直す。
 * アプリで足した語が、deploy を待たずに画像の候補タブに出るようにする。DB が読めなければ焼いたまま
 */
async function withLiveTargets(state) {
  try {
    const [docs, lib] = await Promise.all([
      readNumberDocs(),
      loadLiveTargetsLib(),
    ])
    return lib.withLiveNumberTargets(state, docs)
  } catch (error) {
    console.error('console(targets)', error)
    return state
  }
}

let appEntryLib = null
const loadAppEntryLib = async () =>
  (appEntryLib ??= await import('./lib/firestore/app-entry.js'))

/** 配信データの番号に、DB の最新の語・かな (とスコア) を重ねる。DB が読めなければ配信データのまま */
async function withLiveNumbers(data) {
  try {
    const [docs, lib] = await Promise.all([readNumberDocs(), loadAppEntryLib()])
    const { numbers, changed } = lib.numbersWithDocs(data.numbers ?? [], docs)
    if (changed) console.log('app/data(numbers)', changed)
    return { ...data, numbers }
  } catch (error) {
    console.error('app/data(numbers)', error)
    return data
  }
}

/** 番号 1 件の最新 (保存の直後に読むので写しを使わず DB から読む) */
async function liveNumberEntry(num) {
  const delivered = (readPrivateJson('data.json').numbers ?? []).find(
    (entry) => entry.num === num
  )
  if (!delivered) return null
  const [{ store }, lib] = await Promise.all([
    loadSheetSync(),
    loadAppEntryLib(),
  ])
  const doc = (await store.readNumbers([num]))[num]
  if (doc && numberDocs) numberDocs.docs = { ...numberDocs.docs, [num]: doc }
  return lib.entryWithDoc(delivered, doc)
}

/** 配信データのタグ名に、シート同期で DB に置いた最新の名前を重ねる (deploy 無しで直せるように) */
async function withLiveTagNames(data) {
  try {
    const lib = await loadSheetSync()
    const doc = await lib.tagNamesStore.read()
    if (!doc) return data
    return {
      ...data,
      // 表示用 (略称 → 正式名) と、検索・グループの見出し用 (正式名) の 2 つを最新にする
      tagNames: {
        ...(data.tagNames ?? {}),
        ...lib.tagNames.displayNamesOf(doc.names),
      },
      tagTitles: {
        ...(data.tagTitles ?? {}),
        ...lib.tagNames.searchNamesOf(doc.names),
      },
    }
  } catch (error) {
    // DB が読めなくても辞書は出す。名前が deploy 時点のものになるだけ
    console.error('app/data(tagNames)', error)
    return data
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
