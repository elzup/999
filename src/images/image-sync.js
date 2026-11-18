// 画像データの正本 (Firestore imageSlots) と、手元の cache (word-images*.json 4 ファイル) の同期。
// spec:image-store 段階 2・3 (D-0084, D-0085)。
//
// 既存のスクリプトと console はこれまでどおり 4 ファイルを読み書きする。その前後で syncImages() を呼ぶ:
//   1. 手元の 4 ファイルを «前回同期した時点 (base)» と比べ、変わった枠だけ Firestore に書く
//      (その枠が base の後に別の面から書かれていたら上書きせず «衝突» として返す)
//   2. base の後に更新された文書を Firestore から読み、4 ファイルと base を作り直す
// base は src/data/image-sync-base.json。別プロセス (console から起動する子スクリプト) とも共有する。

import { isDeepStrictEqual } from 'node:util'
import { connect } from '../firestore/db.js'
import {
  IMAGE_SLOTS,
  emptySlotDoc,
  fromSlotDocs,
  replaceImage,
  splitSlotKey,
  toSlotDocs,
} from './slot-docs.js'
import {
  PATHS,
  readJson,
  writeJson,
  loadCandidates,
  loadKeep,
  loadManifest,
  loadRedo,
} from './store.js'

/** 端末ごとの時計のずれを吸収するため、前回より少し前から読み直す (読み直しは無害) */
const PULL_OVERLAP_MS = 5 * 60 * 1000
// 1 トランザクションの書き込みは 500 まで。読みも同じ数だけ入るので余裕を見る
const TX_CHUNK = 100
const FIELDS = ['image', 'keep', 'redo', 'candidate']

const emptyDoc = (key) => {
  const { id, slot } = splitSlotKey(key)
  return emptySlotDoc(id, slot)
}

/** 文書から updatedAt を除いた «中身» */
const bodyOf = ({ updatedAt: _u, ...doc }) => doc

/**
 * base と手元の 4 ファイルを比べ、書くべき枠を返す (純粋関数)。
 * 文書は消さない。手元から消えた枠は中身を空にし、history は残す。
 * @param {Record<string, object>} baseDocs  前回同期した時点の文書 (updatedAt 付き)
 * @returns {{key: string, next: object, expectedUpdatedAt: string|null}[]}
 */
export function diffSlots(baseDocs, files) {
  const current = toSlotDocs(files)
  const keys = new Set([...Object.keys(baseDocs), ...Object.keys(current)])
  return [...keys].sort().flatMap((key) => {
    const base = baseDocs[key] ? bodyOf(baseDocs[key]) : emptyDoc(key)
    const cur = current[key] ?? emptyDoc(key)
    if (FIELDS.every((f) => isDeepStrictEqual(base[f], cur[f]))) return []
    const next = {
      ...replaceImage(base, cur.image),
      keep: cur.keep,
      redo: cur.redo,
      candidate: cur.candidate,
    }
    return [{ key, next, expectedUpdatedAt: baseDocs[key]?.updatedAt ?? null }]
  })
}

const loadFiles = () => ({
  manifest: loadManifest(),
  keep: loadKeep(),
  redo: loadRedo(),
  candidates: loadCandidates(),
})

export const loadBase = () => readJson(PATHS.syncBase, null)

function saveCache(base) {
  const files = fromSlotDocs(base.docs)
  writeJson(PATHS.manifest, files.manifest)
  writeJson(PATHS.keep, files.keep)
  writeJson(PATHS.redo, files.redo)
  writeJson(PATHS.candidates, files.candidates)
  writeJson(PATHS.syncBase, base)
}

/** 変わった枠を書く。base の後に別の面が書いた枠は書かずに衝突として返す */
async function pushChanges(store, changes, now) {
  const written = {}
  const conflicts = []
  for (let i = 0; i < changes.length; i += TX_CHUNK) {
    const chunk = changes.slice(i, i + TX_CHUNK)
    const refs = chunk.map((c) => store.collection(IMAGE_SLOTS).doc(c.key))
    await store.runTransaction(async (tx) => {
      const snaps = await tx.getAll(...refs)
      chunk.forEach((change, j) => {
        const remote = snaps[j].exists ? snaps[j].data() : null
        const remoteAt = remote?.updatedAt ?? null
        if (remote && remoteAt !== change.expectedUpdatedAt) {
          conflicts.push(change.key)
          return
        }
        const doc = { ...change.next, updatedAt: now }
        tx.set(refs[j], doc)
        written[change.key] = doc
      })
    })
  }
  return { written, conflicts }
}

/** since より後に更新された文書を読む。since が無ければ全件 */
async function pullSince(store, since) {
  const col = store.collection(IMAGE_SLOTS)
  if (!since) {
    const snap = await col.get()
    return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))
  }
  const from = new Date(Date.parse(since) - PULL_OVERLAP_MS).toISOString()
  const snap = await col.where('updatedAt', '>', from).get()
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))
}

const maxUpdatedAt = (docs, initial) =>
  Object.values(docs).reduce(
    (max, d) =>
      d.updatedAt && (!max || d.updatedAt > max) ? d.updatedAt : max,
    initial
  )

/**
 * 手元の変更を送り、正本の更新を取り込む。
 * base が無い (初回・別の端末) ときは送らずに全件を取り込む。手元の古い 4 ファイルで正本を潰さないため。
 * @returns {Promise<{pushed: number, pulled: number, conflicts: string[]}>}
 */
export async function syncImages({
  store = connect().raw,
  now = new Date().toISOString(),
} = {}) {
  const base = loadBase()
  const changes = base ? diffSlots(base.docs, loadFiles()) : []
  const { written, conflicts } = await pushChanges(store, changes, now)
  const pulled = await pullSince(store, base?.pulledUntil ?? null)
  const docs = { ...(base?.docs ?? {}), ...written, ...pulled }
  saveCache({
    version: 1,
    pulledUntil:
      maxUpdatedAt({ ...written, ...pulled }, base?.pulledUntil ?? null) ?? now,
    docs,
  })
  if (conflicts.length > 0)
    console.warn(
      `⚠ 画像: ${
        conflicts.length
      } 枠は別の面で先に更新されていたので書かず、そちらを取り込んだ: ${conflicts.join(
        ' '
      )}`
    )
  return {
    pushed: Object.keys(written).length,
    pulled: Object.keys(pulled).length,
    conflicts,
  }
}

/**
 * 起動時の同期。つながらなくても止めずにオフラインで続ける: 手元の変更は base との差分として
 * 残り、次につながったときに送られる (同じ枠を別の面が先に書いていれば衝突として報告)。
 * ただし base が無い (一度も同期していない) ときは止める。次の同期は送らずに全件を取り込むので、
 * オフラインで書いた分が消えるため。
 * @returns {Promise<boolean>} 続けてよいか
 */
export async function syncOnStart(label) {
  try {
    await syncImages()
    return true
  } catch (err) {
    console.error(err)
    if (!loadBase()) {
      console.error(
        `✗ ${label}: 画像の正本 (Firestore) と一度も同期していないので止めた。認証を確認して再実行`
      )
      return false
    }
    console.warn(
      `⚠ ${label}: 画像の正本 (Firestore) とつながらない。手元の cache で続け、変更は次の同期で送る`
    )
    return true
  }
}

/** CLI の main を同期で挟む */
export async function withImageSync(main) {
  if (!(await syncOnStart('画像の同期'))) process.exit(1)
  let failure = null
  try {
    await main()
  } catch (err) {
    failure = err
  }
  try {
    const r = await syncImages()
    console.log(`画像の同期: 送信 ${r.pushed} 枠 / 取り込み ${r.pulled} 枠`)
  } catch (err) {
    console.error(err)
    console.warn(
      '⚠ 変更を Firestore に送れなかった。手元には残っているので、次の同期で送られる'
    )
  }
  if (failure) {
    console.error(failure)
    process.exit(1)
  }
}
