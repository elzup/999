// Firestore を writeNumber が期待する最小の口に包む薄い層。
// spec: .vsdd/firestore-store/specs/design-firestore-schema.md
//
// writeNumber は { runTransaction } しか知らない。こうしておくと
// テストで «読んだ後に他の面が書いた» 状況を作れる (実 DB では作れない)。
//
// 認証は Admin SDK。rules を迂回するので、不変条件を守るのは
// writeNumber と validateNumberDoc の責任になる。

import { cert, getApps, initializeApp } from 'firebase-admin/app'
import { getFirestore } from 'firebase-admin/firestore'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { mirrorWrites } from '../symbols/mirror.js'

const NUMBERS = 'numbers'
const BUNDLES = 'bundles'

/**
 * 認証情報を解決する。GOOGLE_SERVICE_ACCOUNT_PATH は画像アップロードと
 * 用途が違うので流用しない (それで 403 を踏んだ前例がある)。
 */
function credential() {
  const path = process.env.FIRESTORE_KEY
  if (path && existsSync(path)) {
    return { credential: cert(JSON.parse(readFileSync(path, 'utf8'))) }
  }
  // 未指定なら ADC (gcloud auth application-default login)
  return {}
}

/**
 * gcloud auth print-access-token で取ったトークン。
 * ADC (application-default) と gcloud のログインは別物で、ADC だけ別プロジェクトの
 * アカウントを指していることがある。FIRESTORE_ACCESS_TOKEN は Firestore だけに効かせる。
 * GOOGLE_OAUTH_ACCESS_TOKEN は google-sheets.js も拾うので、シートと別アカウントのときに使えない
 */
const accessToken = () =>
  process.env.FIRESTORE_ACCESS_TOKEN || process.env.GOOGLE_OAUTH_ACCESS_TOKEN

/**
 * トークンで繋ぐ Firestore。firebase-admin の Firestore は鍵 (cert) か ADC しか受け付けず、
 * getAccessToken だけの credential を渡すと invalid-credential で落ちる (firebase-admin 14)。
 * なので firebase-admin が内部で使う @google-cloud/firestore をトークン付きで直接作る。
 * require を呼ぶのはこの経路だけ (functions の同梱物にはこの 2 つが入っていないので、
 * 読み込み時に import すると Function が起動できない)
 */
function tokenStore(projectId, token) {
  const require = createRequire(import.meta.url)
  const { Firestore } = require('@google-cloud/firestore')
  const { OAuth2Client } = require('google-auth-library')
  const authClient = new OAuth2Client()
  authClient.setCredentials({ access_token: token })
  return new Firestore({ projectId, authClient })
}

function openStore(projectId) {
  const token = accessToken()
  // 鍵ファイルがあればそちらを優先する (credential() と同じ順)
  const key = process.env.FIRESTORE_KEY
  const hasKey = Boolean(key) && existsSync(key)
  if (token && !hasKey) return tokenStore(projectId, token)
  const app = getApps()[0] ?? initializeApp({ projectId, ...credential() })
  return getFirestore(app)
}

/** .firebaserc の default を既定にする。env 未設定でも別プロジェクトを向かない */
function defaultProjectId() {
  if (process.env.FIREBASE_PROJECT_ID) return process.env.FIREBASE_PROJECT_ID
  const path = new URL('../../.firebaserc', import.meta.url)
  try {
    return JSON.parse(readFileSync(path, 'utf8')).projects?.default
  } catch {
    return undefined
  }
}

export function connect({ projectId = defaultProjectId() } = {}) {
  if (!projectId)
    throw new Error('project id が解決できない (.firebaserc を確認)')
  const store = openStore(projectId)

  return {
    raw: store,

    async runTransaction(fn) {
      return store.runTransaction(async (tx) => {
        return fn({
          get: async (num) => {
            const snap = await tx.get(store.collection(NUMBERS).doc(num))
            return snap.exists ? snap.data() : undefined
          },
          set: async (num, doc) => {
            tx.set(store.collection(NUMBERS).doc(num), doc)
          },
          mirror: async (num, doc) => {
            let writes
            try {
              writes = mirrorWrites(doc, new Date().toISOString())
            } catch (error) {
              // 写しが作れなくても保存は止めない。正本はまだ numbers で、写しのずれは
              // scripts/migrate-symbols.ts --verify が拾い、--apply で作り直せる
              console.error('mirror(symbols)', num, error)
              return
            }
            for (const write of writes) {
              tx.set(store.collection(write.col).doc(write.id), write.data, {
                merge: write.merge,
              })
            }
          },
        })
      })
    },

    /** 1 件だけ読む。書き込み前の現在値取得と統合ビューの表示に使う */
    async readNumber(num) {
      const snap = await store.collection(NUMBERS).doc(num).get()
      return snap.exists ? snap.data() : undefined
    },

    /** 指定した番号をまとめて読む。無い番号は結果に含めない */
    async readNumbers(nums) {
      if (!nums.length) return []
      const refs = nums.map((num) => store.collection(NUMBERS).doc(num))
      const snaps = await store.getAll(...refs)
      return snaps.filter((snap) => snap.exists).map((snap) => snap.data())
    },

    /** 既存の numbers を全部読む (同期・移行のプラン作成用) */
    async readAllNumbers() {
      const snap = await store.collection(NUMBERS).get()
      return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))
    },

    async readChunk(id) {
      const snap = await store.collection(BUNDLES).doc(id).get()
      return snap.exists ? snap.data() : null
    },

    /** チャンクはサーバが作る派生物なのでそのまま置き換える */
    async writeChunks(bundles) {
      const batch = store.batch()
      for (const bundle of bundles) {
        batch.set(store.collection(BUNDLES).doc(bundle.id), bundle)
      }
      await batch.commit()
      return bundles.length
    },
  }
}
