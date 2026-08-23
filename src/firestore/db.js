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
  // gcloud auth print-access-token で取ったトークンを使う。
  // ADC (application-default) と gcloud のログインは別物で、
  // ADC だけ別プロジェクトのアカウントを指していることがある
  const token = process.env.GOOGLE_OAUTH_ACCESS_TOKEN
  if (token) {
    return {
      credential: {
        getAccessToken: async () => ({
          access_token: token,
          expires_in: 3600,
        }),
      },
    }
  }
  // 未指定なら ADC (gcloud auth application-default login)
  return {}
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
  const app = getApps()[0] ?? initializeApp({ projectId, ...credential() })
  const store = getFirestore(app)

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
        })
      })
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
