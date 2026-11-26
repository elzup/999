// Firestore REST API 版のアダプタ。db.js と同じ口 (runTransaction / readAllNumbers /
// readChunk / writeChunks) を出す。
//
// Admin SDK は cert か ADC しか受け付けないため、gcloud auth print-access-token で
// 取ったアクセストークンでは使えない。ADC (application-default) と gcloud のログインは
// 別物で、ADC だけ別プロジェクトのアカウントを指していることがある。
// REST なら Bearer トークンをそのまま渡せる。
//
// 本番は番号の文書を symbols / words から読む (NUMBERS_SOURCE=symbols、2026-11-26)。この口から numbers だけを
// 書くと、アプリに出ないうえ次の保存で symbols の古い値に戻される。なので保存は同じ commit で symbols / words にも書く
// (db.js の mirror と同じ mirrorWrites)。読みは numbers のままでよい: 書き手が全部両方に同じものを書くので一致する
// (scripts/compare-number-sources.ts で確かめられる)

import { mirrorWrites } from '../symbols/mirror.js'

const NUMBERS = 'numbers'
const BUNDLES = 'bundles'

/** JS の値 -> Firestore REST の型付き値 */
export function toValue(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'string') return { stringValue: value }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? { integerValue: String(value) }
      : { doubleValue: value }
  }
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map(toValue) } }
  }
  return { mapValue: { fields: toFields(value) } }
}

export function toFields(obj) {
  return Object.fromEntries(
    Object.entries(obj).map(([key, value]) => [key, toValue(value)])
  )
}

/** Firestore REST の型付き値 -> JS の値 */
export function fromValue(value) {
  if (!value) return undefined
  if ('nullValue' in value) return null
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('timestampValue' in value) return value.timestampValue
  if ('arrayValue' in value)
    return (value.arrayValue.values ?? []).map(fromValue)
  if ('mapValue' in value) return fromFields(value.mapValue.fields ?? {})
  return undefined
}

export function fromFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => [key, fromValue(value)])
  )
}

export function connectRest({ projectId, token, fetchImpl = fetch }) {
  if (!projectId) throw new Error('project id が必要')
  if (!token) throw new Error('access token が必要')

  const root = `projects/${projectId}/databases/(default)/documents`
  const base = `https://firestore.googleapis.com/v1/${root}`
  const docName = (col, id) => `${root}/${col}/${id}`

  async function call(path, { method = 'GET', body } = {}) {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    if (res.status === 404) return null
    const json = await res.json()
    if (!res.ok) {
      throw new Error(`${res.status} ${json?.error?.message ?? 'unknown'}`)
    }
    return json
  }

  async function readDoc(col, id, transaction) {
    const query = transaction
      ? `?transaction=${encodeURIComponent(transaction)}`
      : ''
    const doc = await call(`/${col}/${id}${query}`)
    return doc?.fields ? fromFields(doc.fields) : undefined
  }

  return {
    async runTransaction(fn) {
      const begun = await call(':beginTransaction', {
        method: 'POST',
        body: {},
      })
      const transaction = begun.transaction
      const writes = []

      const result = await fn({
        get: (num) => readDoc(NUMBERS, num, transaction),
        set: async (num, doc) => {
          writes.push({
            update: { name: docName(NUMBERS, num), fields: toFields(doc) },
          })
        },
        // 写しが作れなければ投げて commit しない (symbols が正本なので、numbers だけ進めない)
        mirror: async (_num, doc) => {
          for (const write of mirrorWrites(doc, new Date().toISOString())) {
            const update = {
              name: docName(write.col, write.id),
              fields: toFields(write.data),
            }
            writes.push(
              write.merge
                ? {
                    update,
                    updateMask: { fieldPaths: Object.keys(write.data) },
                  }
                : { update }
            )
          }
        },
      })

      await call(':commit', { method: 'POST', body: { writes, transaction } })
      return result
    },

    async readAllNumbers() {
      const docs = {}
      let pageToken
      do {
        const page = await call(
          `/${NUMBERS}?pageSize=300${
            pageToken ? `&pageToken=${pageToken}` : ''
          }`
        )
        for (const doc of page?.documents ?? []) {
          docs[doc.name.split('/').pop()] = fromFields(doc.fields ?? {})
        }
        pageToken = page?.nextPageToken
      } while (pageToken)
      return docs
    },

    /** 任意コレクションの 1 件。sheet:bisync の dry-run が sync/* を読む */
    readDoc: (col, id) => readDoc(col, id),

    readChunk: (id) => readDoc(BUNDLES, id).then((doc) => doc ?? null),

    async writeChunks(bundles) {
      // チャンクは派生物なので、まとめて置き換える
      await call(':commit', {
        method: 'POST',
        body: {
          writes: bundles.map((bundle) => ({
            update: {
              name: docName(BUNDLES, bundle.id),
              fields: toFields(bundle),
            },
          })),
        },
      })
      return bundles.length
    },
  }
}
