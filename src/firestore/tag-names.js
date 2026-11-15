// tags タブ (tag / title / short_title) を Firestore の sync/tagNames に写す。
// タグ名は配信データ (private/data.json) にしか無く、直すたびに deploy が要った。
// シート同期と同じ経路で DB に置き、/api/app/data がそれを上に重ねて返す。

const COLLECTION = 'sync'
const DOC_ID = 'tagNames'
export const TAG_NAMES_RANGE = 'tags!A1:Z'
// 未確定の印。sync-tags.js と同じく名前として出さない
const UNKNOWN_TITLE = '?'

/** シートの値 (見出し行つき) → { tag: { title, short } }。列は見出しで引く (並びは変わりうる) */
export function tagNamesFromValues(values) {
  const [header = [], ...rows] = values ?? []
  const col = (name) => header.map((h) => String(h).trim()).indexOf(name)
  const tagCol = col('tag')
  const titleCol = col('title')
  const shortCol = col('short_title')
  if (tagCol === -1 || titleCol === -1) {
    throw new Error(`tags の見出しに tag / title が無い: ${header.join(',')}`)
  }
  const cell = (r, i) => (i === -1 ? '' : String(r[i] ?? '').trim())
  return Object.fromEntries(
    rows
      .map((r) => [
        cell(r, tagCol),
        { title: cell(r, titleCol), short: cell(r, shortCol) },
      ])
      .filter(([tag, n]) => tag && (n.title || n.short))
  )
}

/** 表示名の表。short_title → title の順で引く (generate-preview-data.js の tagNames と同じ) */
export function displayNamesOf(names) {
  return Object.fromEntries(
    Object.entries(names ?? {})
      .map(([tag, n]) => [
        tag,
        n.short || (n.title === UNKNOWN_TITLE ? '' : n.title),
      ])
      .filter(([, name]) => name)
  )
}

const sameNames = (a, b) => JSON.stringify(a ?? {}) === JSON.stringify(b ?? {})

export function createTagNamesStore(db) {
  const ref = db.raw.collection(COLLECTION).doc(DOC_ID)
  return {
    async read() {
      const snap = await ref.get()
      return snap.exists ? snap.data() : null
    },
    write: (doc) => ref.set(doc),
  }
}

/** シートの tags を読み、変わっていれば DB に書く。apply=false なら差分だけ返す */
export async function syncTagNames({ readValues, store, now, apply = true }) {
  const names = tagNamesFromValues(await readValues())
  const prev = (await store.read())?.names ?? {}
  const changed = Object.keys({ ...prev, ...names }).filter(
    (tag) => !sameNames(prev[tag], names[tag])
  )
  if (apply && changed.length) await store.write({ names, updatedAt: now })
  return { count: Object.keys(names).length, changed }
}
