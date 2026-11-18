// 画像データ 4 ファイルを Firestore imageSlots に写す (spec:image-store 段階 1)。
//   nr images:migrate           dry-run。往復の一致と件数・文書サイズだけ確かめる (DB に触らない)
//   nr images:migrate --apply   imageSlots が空のときだけ書き込み、読み戻して手元と照合する
//
// 照合に通らなければ書かない / 失敗扱いにする (REQ-IMG-003)。手元の 4 ファイルは変更しない。

import { isDeepStrictEqual } from 'node:util'
import { connect } from '../firestore/db.js'
import { loadCandidates, loadKeep, loadManifest, loadRedo } from './store.js'
import {
  IMAGE_SLOTS,
  countFiles,
  fromSlotDocs,
  toSlotDocs,
} from './slot-docs.js'

// Firestore の batch は 500 書き込みまで。余裕を見て下回らせる
const BATCH_SIZE = 400
// 1 文書の上限は 1MiB。これを超えそうなら設計を見直す合図として止める
const DOC_SIZE_WARN = 100_000

const loadFiles = () => ({
  manifest: loadManifest(),
  keep: loadKeep(),
  redo: loadRedo(),
  candidates: loadCandidates(),
})

function checkRoundTrip(files, docs) {
  const back = fromSlotDocs(docs)
  const parts = ['manifest', 'keep', 'redo', 'candidates']
  return parts.filter((p) => !isDeepStrictEqual(back[p], files[p]))
}

function largestDoc(docs) {
  return Object.entries(docs)
    .map(([key, doc]) => [key, Buffer.byteLength(JSON.stringify(doc))])
    .reduce((max, cur) => (cur[1] > max[1] ? cur : max), ['', 0])
}

async function writeDocs(store, docs) {
  const entries = Object.entries(docs)
  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = store.batch()
    for (const [key, doc] of entries.slice(i, i + BATCH_SIZE))
      batch.set(store.collection(IMAGE_SLOTS).doc(key), doc)
    await batch.commit()
    console.log(
      `  書き込み ${Math.min(i + BATCH_SIZE, entries.length)} / ${
        entries.length
      }`
    )
  }
}

async function readDocs(store) {
  const snap = await store.collection(IMAGE_SLOTS).get()
  return Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]))
}

async function apply(files, docs) {
  const store = connect().raw
  const existing = (await store.collection(IMAGE_SLOTS).count().get()).data()
    .count
  if (existing > 0)
    throw new Error(
      `${IMAGE_SLOTS} に既に ${existing} 件ある。上書きしない (中身を確かめてから)`
    )
  await writeDocs(store, docs)
  const back = await readDocs(store)
  const diff = checkRoundTrip(files, back)
  console.log(
    '読み戻し:',
    countFiles(fromSlotDocs(back)),
    `(${Object.keys(back).length} 文書)`
  )
  if (diff.length > 0)
    throw new Error(`読み戻しが手元と一致しない: ${diff.join(', ')}`)
  console.log('✓ 読み戻しが手元の 4 ファイルと一致した')
}

async function main() {
  const isApply = process.argv.includes('--apply')
  const files = loadFiles()
  const docs = toSlotDocs(files)
  const [bigKey, bigSize] = largestDoc(docs)

  console.log('手元:', countFiles(files))
  console.log(
    `文書: ${Object.keys(docs).length} 件 (最大 ${bigKey} ${bigSize} bytes)`
  )
  const diff = checkRoundTrip(files, docs)
  if (diff.length > 0)
    throw new Error(`往復で一致しない: ${diff.join(', ')}。投入しない`)
  if (bigSize > DOC_SIZE_WARN)
    throw new Error(`${bigKey} が ${bigSize} bytes。文書の形を見直す`)
  console.log('✓ 往復 (4 ファイル → 文書 → 4 ファイル) が一致した')

  if (!isApply) {
    console.log(`dry-run。書き込むなら --apply (${IMAGE_SLOTS} が空のときだけ)`)
    return
  }
  await apply(files, docs)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
