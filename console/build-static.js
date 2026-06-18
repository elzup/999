// bayalhost 用の閲覧専用 gallery を dist-gallery/ に生成する。
// state を state.json に焼き込み、index.html/app.js をコピー。
// app.js は /api/state が無いと ./state.json にフォールバックして read-only になる。

import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildState } from './server.js'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'dist-gallery')

mkdirSync(outDir, { recursive: true })

// 閲覧専用なので redo/candidates の生データは出さず、表示に要る分だけ焼く
const state = buildState()
const baked = {
  words: state.words,
  images: state.images,
  candidates: {},
  redo: {},
  keep: state.keep,
}

writeFileSync(join(outDir, 'state.json'), JSON.stringify(baked) + '\n')
copyFileSync(join(here, 'app.js'), join(outDir, 'app.js'))

// app.js をキャッシュバスティング (デプロイ毎に ?v が変わる)
const ver = Date.now()
const html = readFileSync(join(here, 'index.html'), 'utf-8').replace(
  './app.js',
  `./app.js?v=${ver}`
)
writeFileSync(join(outDir, 'index.html'), html)

const withImg = Object.values(state.images).reduce(
  (n, slots) => n + Object.keys(slots).length,
  0
)
console.log(
  `dist-gallery/ generated: ${state.words.length} words, ${withImg} images`
)
