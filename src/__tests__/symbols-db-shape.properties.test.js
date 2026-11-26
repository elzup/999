// DB 移行 (numbers → symbols / words) の不変条件を総当たりで確かめる (property-based)。
// 実データの往復 (.metarc/check-symbols-roundtrip.ts) は «今あるデータ» でしか確かめられない。
// ここでは番号の文書を生成し、これから入る形 (出典 2 つ・タグの並び・枠の外の語・かな無し) でも
// 移行が値を落とさないことを見る。性質の中身は helpers/symbols-db-shape.properties.js。
// 可視化: node scripts/report-db-migration-properties.ts

import fc from 'fast-check'
import { describe, it } from 'vitest'
import * as shape from '../symbols/db-shape.js'
import { dbShapeProperties } from './helpers/symbols-db-shape.properties.js'

const RUNS = { numRuns: 1000 }

describe('DB 移行の不変条件 (property-based)', () => {
  dbShapeProperties(shape).forEach((p) => {
    it(`${p.id}: ${p.guards}`, () => {
      fc.assert(fc.property(p.arb, p.check), RUNS)
    })
  })
})
