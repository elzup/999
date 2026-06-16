// 現在 manifest にある全画像をロックする (一括処理での上書きを一括で防ぐ)。
//   nr images:keep-all           現状の全画像をロック
//   nr images:keep-all --clear   全ロック解除

import {
  PATHS,
  loadManifest,
  loadKeep,
  writeJson,
  slotKey,
} from './images/store.js'

const CLEAR = process.argv.includes('--clear')

const keep = loadKeep()
if (CLEAR) {
  keep.keep = {}
  writeJson(PATHS.keep, keep)
  console.log('全ロック解除しました')
} else {
  const images = loadManifest().images || {}
  let n = 0
  for (const num of Object.keys(images)) {
    for (const slot of Object.keys(images[num])) {
      if (images[num][slot]?.url) {
        keep.keep[slotKey(num, slot)] = true
        n++
      }
    }
  }
  writeJson(PATHS.keep, keep)
  console.log(`${n} 枚をロックしました (一括処理で上書きされません)`)
}
