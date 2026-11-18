// web 版の画像コンソール (/console/) が読む state を Function に同梱する (D-0073)。
// 語を含む私的データなので hosting には置かず、functions/private/ に焼いて
// 認証付きの /api/console/state からだけ返す。nr deploy の sync:private から呼ぶ。

import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildState } from '../console/server.js'

const here = dirname(fileURLToPath(import.meta.url))
const outDir = join(here, '..', 'functions', 'private')

const state = buildState()
// 候補の生データ (検索結果の URL 一式) は web の画面が使わないので焼かない。
// 画像と印は Function が正本 (imageSlots) から重ねるので焼かない (spec:image-store)
const baked = { ...state, candidates: {}, images: {}, keep: {}, redo: {} }

mkdirSync(outDir, { recursive: true })
writeFileSync(join(outDir, 'console-state.json'), JSON.stringify(baked) + '\n')
console.log(`console-state.json: ${state.targets.length} targets`)
