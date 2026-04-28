import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  loadWords,
  categoryScore,
  extractName,
  isKanaOnly,
  normalizeForCompare,
} from './words.js'
import { score } from './scorer.js'
import { kataToHira } from './table.js'

const srcDir = dirname(fileURLToPath(import.meta.url))

/** トークン種別を短縮記号に変換 */
function tokenLabel(t) {
  const labels = {
    single: 'D',
    double: 'DD',
    sokuon: 'っ',
    halfOverflow: 'H',
    overflow: 'X',
  }
  return labels[t.type] ?? '?'
}

/** 先頭0省略・オーバーフロー(後ろ余分)を考慮した数字一致判定 */
function isDigitMatch(actual, num) {
  if (actual === num) return true
  if (actual.length < num.length)
    return actual.padStart(num.length, '0') === num
  if (actual.length > num.length) return actual.slice(0, num.length) === num
  return false
}

function checkKanaHead(name, kanaReading) {
  if (!name || !kanaReading) return null
  if (!isKanaOnly(name)) return null
  const normName = normalizeForCompare(name)
  const normKana = normalizeForCompare(kanaReading)
  if (!normName || !normKana) return null
  if (normName[0] === normKana[0]) return null
  return { nameHead: normName[0], kanaHead: normKana[0] }
}

function buildData(filename = 'words.tsv') {
  const entries = loadWords(filename)

  const patterns = {}
  const tokenTypes = {
    core: 0,
    sub: 0,
    bad: 0,
    double: 0,
    sokuon: 0,
    halfOverflow: 0,
    overflow: 0,
  }
  let youon4Count = 0
  let scoredCount = 0
  const kanaUsage = {}
  // digitKanaAlloc[pos][digit][kana] = count — 各桁位置×数字ごとの使用かな分布
  const digitKanaAlloc = [0, 1, 2].map(() => {
    const digits = {}
    for (let d = 0; d <= 9; d++) digits[d] = {}
    return digits
  })
  const violations = {
    digitMismatch: [], // エンコード後の数字が登録 num と異なる
    encodeError: [], // エンコード失敗（未知のかな等）
    kanaHeadMismatch: [], // 表示語の先頭字とよみ先頭字が一致しない
    mix: [], // 同じ数字が異なるかなで表されている
    overflow: [], // 目標桁数を超えるトークンを含む
  }

  const data = entries.map((entry) => {
    const cat = categoryScore(entry)
    const row = {
      num: entry.num,
      hito: entry.hito,
      mono: entry.mono,
      gainen: entry.gainen,
      w1: entry.w1,
      w1k: entry.w1k,
      w2: entry.w2,
      w2k: entry.w2k,
      ...cat,
      w1Score: null,
      w1Error: false,
      w1Pattern: '',
      w2Score: null,
      w2Error: false,
    }

    if (entry.w1k) {
      try {
        const s = score(entry.w1k)
        row.w1Score = s.score
        const pat = s.tokens.map(tokenLabel).join('+')
        row.w1Pattern = pat
        patterns[pat] = (patterns[pat] ?? 0) + 1
        let digitPos = 0
        for (const t of s.tokens) {
          if (t.type === 'single') {
            tokenTypes[t.tier ?? 'bad']++
          } else {
            tokenTypes[t.type]++
          }
          const nk = [...t.kana].map((ch) => kataToHira(ch)).join('')
          kanaUsage[nk] = (kanaUsage[nk] ?? 0) + 1
          // 各桁位置×数字のかな割り当て集計
          for (const ch of t.value) {
            const d = Number(ch)
            if (d >= 0 && d <= 9 && digitPos < 3) {
              const alloc = digitKanaAlloc[digitPos][d]
              alloc[nk] = (alloc[nk] ?? 0) + 1
            }
            digitPos++
          }
        }
        if (s.youon4) youon4Count++
        scoredCount++

        // 違反チェック: エンコード結果の数字 vs 登録 num（先頭0省略・末尾overflow許容）
        if (!isDigitMatch(s.digits, entry.num)) {
          violations.digitMismatch.push({
            num: entry.num,
            side: 'w1',
            kana: entry.w1k,
            actual: s.digits,
          })
        }
        // mix: 同じ数字が異なるかなで表されている
        if (s.mix) {
          violations.mix.push({ num: entry.num, side: 'w1', kana: entry.w1k })
        }
        // overflow: 目標桁数を超えるトークンを含む
        if (s.tokens.some((t) => t.type === 'overflow')) {
          violations.overflow.push({
            num: entry.num,
            side: 'w1',
            kana: entry.w1k,
            digits: s.digits,
          })
        }
      } catch (err) {
        row.w1Error = true
        violations.encodeError.push({
          num: entry.num,
          side: 'w1',
          kana: entry.w1k,
          message: err.message,
        })
      }
    }

    if (entry.w2k) {
      try {
        const s2 = score(entry.w2k)
        row.w2Score = s2.score
        if (!isDigitMatch(s2.digits, entry.num)) {
          violations.digitMismatch.push({
            num: entry.num,
            side: 'w2',
            kana: entry.w2k,
            actual: s2.digits,
          })
        }
        if (s2.mix) {
          violations.mix.push({ num: entry.num, side: 'w2', kana: entry.w2k })
        }
        if (s2.tokens.some((t) => t.type === 'overflow')) {
          violations.overflow.push({
            num: entry.num,
            side: 'w2',
            kana: entry.w2k,
            digits: s2.digits,
          })
        }
      } catch (err) {
        row.w2Error = true
        violations.encodeError.push({
          num: entry.num,
          side: 'w2',
          kana: entry.w2k,
          message: err.message,
        })
      }
    }

    // 表示語先頭 vs よみ先頭の一致チェック（かな名詞のみ）
    const headW1 = checkKanaHead(extractName(entry.w1), entry.w1k)
    if (headW1) {
      violations.kanaHeadMismatch.push({
        num: entry.num,
        side: 'w1',
        word: entry.w1,
        kana: entry.w1k,
        ...headW1,
      })
    }
    const headW2 = checkKanaHead(extractName(entry.w2), entry.w2k)
    if (headW2) {
      violations.kanaHeadMismatch.push({
        num: entry.num,
        side: 'w2',
        word: entry.w2,
        kana: entry.w2k,
        ...headW2,
      })
    }

    return row
  })

  const ruleStats = {
    patterns,
    tokenTypes,
    youon4Count,
    scoredCount,
    kanaUsage,
    digitKanaAlloc,
    violations,
  }
  return { data, ruleStats }
}

function logStats(label, data) {
  const filled = data.filter((d) => d.w1k).length
  const hasAll = data.filter(
    (d) => d.hito && d.mono && d.gainen && d.w1k
  ).length
  console.log(
    `${label}: ${data.length} entries  w1k: ${filled}  all: ${hasAll}`
  )
}

function main() {
  // Real data → gitignored JSON
  const { data, ruleStats } = buildData('words.tsv')
  const outPath = join(srcDir, 'visualize-words.data.json')
  writeFileSync(outPath, JSON.stringify({ data, ruleStats }, null, 2))
  logStats(outPath, data)

  // Sample data → committed JSON
  const { data: sampleData, ruleStats: sampleRuleStats } =
    buildData('words.tsv.sample')
  const samplePath = join(srcDir, 'visualize-words.data.sample.json')
  writeFileSync(
    samplePath,
    JSON.stringify({ data: sampleData, ruleStats: sampleRuleStats }, null, 2)
  )
  logStats(samplePath, sampleData)
}

main()
