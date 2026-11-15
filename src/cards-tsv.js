// cards.tsv (シートの card タブ) の行を読む。配信データ生成と画像コンソールで共用する。

const MARK_SUIT = {
  '♠️': 'S',
  '♠': 'S',
  '♥️': 'H',
  '♥': 'H',
  '♣️': 'C',
  '♣': 'C',
  '♦️': 'D',
  '♦': 'D',
}

export function parseMark(mark) {
  for (const [sym, suit] of Object.entries(MARK_SUIT)) {
    if (mark.startsWith(sym)) return { suit, rank: mark.slice(sym.length) }
    if (mark.endsWith(sym)) return { suit, rank: mark.slice(0, -sym.length) }
  }
  return null
}

export function parseScore(raw) {
  const trimmed = String(raw || '').trim()
  if (!trimmed) return null
  const value = Number(trimmed)
  if (!Number.isFinite(value)) return null
  return Math.max(0, Math.min(3, value))
}

/**
 * TSV 本文をカードの生データに変換する (検証前)。
 * mark が読めない行は onSkip に渡して捨てる。
 */
export function parseCardsTsv(tsv, onSkip = () => {}) {
  const lines = tsv.split('\n').filter((l) => l.trim())
  const headers = lines[0].split('\t').map((h) => h.trim())
  const colIdx = (name) => headers.indexOf(name)
  return lines
    .slice(1)
    .map((line) => {
      const cols = line.split('\t').map((c) => c.trim())
      const col = (name) => cols[colIdx(name)] ?? ''
      const mark = col('mark')
      const parsed = parseMark(mark)
      if (!parsed) {
        onSkip(mark)
        return null
      }
      return {
        suit: parsed.suit,
        rank: parsed.rank,
        person: col('person'),
        actionP: col('action_p'),
        personScore: parseScore(col('score_p')),
        object: col('object'),
        actionO: col('action_o'),
        objectScore: parseScore(col('score_o')),
        action: col('action'),
        actionScore: parseScore(col('score_a')),
      }
    })
    .filter(Boolean)
}
