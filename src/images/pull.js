// 画像データの正本 (Firestore imageSlots) と手元の cache を同期する (spec:image-store)。
//   nr images:pull
// 手元で変えた枠を送ってから、正本の更新を取り込む。build:data や deploy の前に通す。

import { syncImages } from './image-sync.js'

syncImages()
  .then((r) => {
    console.log(`画像の同期: 送信 ${r.pushed} 枠 / 取り込み ${r.pulled} 枠`)
    if (r.conflicts.length > 0) process.exitCode = 1
  })
  .catch((err) => {
    console.error(err)
    console.error('✗ 画像の正本 (Firestore) と同期できなかった。認証を確認')
    process.exit(1)
  })
