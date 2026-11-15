// 規則表 (かな → 数字) の TSV を文字列で渡す。node では fs で読む。
// ブラウザ (アプリ) では vite.config.ts の alias で rule-tsv.browser.js に差し替わる。
// table.js を fs から切り離し、rankey をアプリでも計算できるようにするため (D-0045)
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dataDir = join(dirname(fileURLToPath(import.meta.url)), 'data')
const load = (filename) =>
  readFileSync(join(dataDir, filename), 'utf-8').trimEnd()

export const SINGLE_DIGIT_TSV = load('single_digit.tsv')
export const DOUBLE_DIGIT_TSV = load('double_digit.tsv')
export const LONG_DIGIT_TSV = load('long_digit.tsv')
