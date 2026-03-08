import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadWords, categoryScore } from './words.js'
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
      } catch {
        row.w1Error = true
      }
    }

    if (entry.w2k) {
      try {
        const s2 = score(entry.w2k)
        row.w2Score = s2.score
      } catch {
        row.w2Error = true
      }
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
  }
  return { data, ruleStats }
}

function logStats(label, data) {
  const filled = data.filter((d) => d.w1k).length
  const hasAll = data.filter(
    (d) => d.hito && d.mono && d.gainen && d.w1k
  ).length
  console.log(`${label}: ${data.length} entries  w1k: ${filled}  all: ${hasAll}`)
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
