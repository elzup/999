// Firestore REST API 版のアダプタ。db.js と同じ口 (runTransaction / readAllNumbers /
// readChunk / writeChunks) を出す。
//
// Admin SDK は cert か ADC しか受け付けないため、gcloud auth print-access-token で
// 取ったアクセストークンでは使えない。ADC (application-default) と gcloud のログインは
// 別物で、ADC だけ別プロジェクトのアカウントを指していることがある。
// REST なら Bearer トークンをそのまま渡せる。
//
// DB4_WRITE=on のとき、保存を同じ commit で新しい形 (symbols / words) にも書く (db.js と同じ src/db4/write-layer.js)。
// 読みは numbers から (CLI 用。表示用の読みを新しい形にするのは Function 側の db.js)

import {
  commitNumberWrite,
  isDb4WriteOn,
  prepareNumberWrite,
  SYMBOLS as DB4_SYMBOLS,
} from '../db4/write-layer.js'

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

export function connectRest({
  projectId,
  token,
  fetchImpl = fetch,
  source = process.env.NUMBERS_SOURCE === 'symbols' ? 'symbols' : 'numbers',
}) {
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
    // 記号の ID は num:106 の形。: をそのまま置くと REST のメソッド (:commit など) と紛れる
    const doc = await call(`/${col}/${encodeURIComponent(id)}${query}`)
    return doc?.fields ? fromFields(doc.fields) : undefined
  }

  // array-contains-any は 1 回 30 値まで (Firestore の上限)
  const ANY_LIMIT = 30
  const restIo = (transaction, writes) => ({
    getDocs: (col, ids) =>
      Promise.all(
        ids.map(async (id) => {
          const doc = await readDoc(col, id, transaction)
          return doc ? { id, ...doc } : undefined
        })
      ),
    findSymbolsUsing: async (wordIds) => {
      const chunks = Array.from(
        { length: Math.ceil(wordIds.length / ANY_LIMIT) },
        (_, i) => wordIds.slice(i * ANY_LIMIT, (i + 1) * ANY_LIMIT)
      )
      const rows = await Promise.all(
        chunks.map((chunk) =>
          call(':runQuery', {
            method: 'POST',
            body: {
              transaction,
              structuredQuery: {
                from: [{ collectionId: DB4_SYMBOLS }],
                where: {
                  fieldFilter: {
                    field: { fieldPath: 'wordIds' },
                    op: 'ARRAY_CONTAINS_ANY',
                    value: toValue(chunk),
                  },
                },
              },
            },
          })
        )
      )
      const docs = rows
        .flat()
        .filter((row) => row.document)
        .map((row) => ({
          id: decodeURIComponent(row.document.name.split('/').at(-1)),
          ...fromFields(row.document.fields ?? {}),
        }))
      return [...new Map(docs.map((d) => [d.id, d])).values()]
    },
    set: (col, id, data) =>
      writes.push({
        update: { name: docName(col, id), fields: toFields(data) },
      }),
    remove: (col, id) => writes.push({ delete: docName(col, id) }),
  })

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
        // 新しい形 (v4) への書き込み。db.js と同じ口 (DB4_WRITE=on のときだけ)
        ...(isDb4WriteOn()
          ? {
              prepareMirror: (num) =>
                prepareNumberWrite(restIo(transaction, writes), num),
              mirror: async (_num, doc, plan) => {
                commitNumberWrite(restIo(transaction, writes), plan, doc)
              },
            }
          : {}),
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
