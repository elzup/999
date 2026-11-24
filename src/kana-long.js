// よみから長音の «う» を消してしまった漢字の語の候補を出す (nr kana:long の規則)。
//
//   将棋 しょぎ → しょｳぎ   (しょう の う を読まないかな ｳ で残す)
//
// 漢字の語は読みを機械で引けない (nr kana:skip の restore はかなだけの語しか突き合わせられない) ので、
// お段・ゅ の後ろに ｳ を足しても読む数字が変わらない位置を «候補» として挙げるだけにする。
// 所持 (しょじ) のように本当に う が無い語も混ざるので、書き直しは一覧を見て手で行う。

import { KANA_CELL_PATTERN } from './kana-notation.js'
import { columnName } from './kana-skip-migrate.js'
import { score } from './scorer.js'
import { extractName, isKanaOnly } from './words.js'

const KANA_CELL = new RegExp(KANA_CELL_PATTERN)
/** 後ろに長音の う が来うる字 (お段 + ゅ ょ)。しょう・とう・しゅう など */
const LONG_BEFORE = new Set([...'おこごそぞとどのほぼぽもよょろをゅ'])
/** もう伸ばしてある (う / ｳ / ー / ｰ / お が続く) なら足さない */
const ALREADY_LONG = new Set([...'うｳーｰおｵ'])
const KANJI = /[㐀-鿿々〆]/

const text = (value) =>
  value === null || value === undefined ? '' : String(value).trim()

const digitsOf = (kana) => {
  try {
    return score(kana).digits
  } catch {
    return null
  }
}

/**
 * 1 枠の候補。ｳ を足したよみを位置ごとに返す (無ければ空)。
 * 漢字を含む語だけが対象 (かなだけの語は nr kana:skip の restore が語と突き合わせて戻す)
 * @param {string} word 語
 * @param {string} kana よみ
 * @param {string} num  3 桁の番号
 * @returns {string[]}
 */
export function longVowelCandidates(word, kana, num) {
  const reading = text(kana)
  if (!reading || !/^\d{3}$/.test(text(num))) return []
  const name = extractName(text(word))
  if (!name || isKanaOnly(name) || !KANJI.test(name)) return []
  const before = digitsOf(reading)
  if (before === null) return []
  const chars = [...reading]
  return chars.flatMap((ch, i) => {
    if (!LONG_BEFORE.has(ch) || ALREADY_LONG.has(chars[i + 1])) return []
    const next = [...chars.slice(0, i + 1), 'ｳ', ...chars.slice(i + 1)].join('')
    return KANA_CELL.test(next) && digitsOf(next) === before ? [next] : []
  })
}

/**
 * words.tsv の全枠から候補を集める。prefix を渡すとその番号で始まるものだけ (例 '44')
 * @param {object[]} entries loadWords() の結果
 * @param {string[]} slotKeys 見る枠 (wh1 など。よみの列は `${slot}k`)
 * @returns {{num, slot, word, kana, candidates: string[]}[]}
 */
export function collectLongVowelCandidates(entries, slotKeys, prefix = '') {
  return entries
    .filter((entry) => text(entry.num).startsWith(prefix))
    .flatMap((entry) =>
      slotKeys.flatMap((slot) => {
        const word = text(entry[slot])
        const kana = text(entry[`${slot}k`])
        const candidates = longVowelCandidates(word, kana, entry.num)
        return candidates.length
          ? [{ num: text(entry.num), slot, word, kana, candidates }]
          : []
      })
    )
    .sort((a, b) => a.num.localeCompare(b.num))
}

// ---- LLM に判定を頼む (nr kana:long --prompt / --answers) ----
// 漢字の語の読みは LLM なら引けるので、候補一覧を小分けにして codex などへ渡し、答えを取り込む。
// トークンを抑えるため、1 行 1 枠のタブ区切りで送り、答えは «直す行だけ» を 1 行ずつ返させる。
// 答えは候補の中から選んだものしか受け付けない (候補は読む数字を変えないことを確かめてあるので、
// LLM が間違えても番号の読み方は壊れない)。

/** 1 依存あたりの行数。多すぎると答えの取りこぼしが増える */
export const PROMPT_BATCH_SIZE = 200

export const PROMPT_HEADER = [
  '語の«よみ»から、長音の う が抜けているものを直す。',
  '各行: id<TAB>語<TAB>今のよみ<TAB>候補 (/ 区切り)。ｳ は «発音するが数字にしない う»。',
  '語の正しい読みで その位置に う が入るなら、候補から 1 つ選ぶ。入らない・分からない行は出さない。',
  '出力は直す行だけを «id<TAB>選んだ候補» で 1 行ずつ。前置き・説明・コードブロックは書かない。',
  '---',
].join('\n')

export const rowId = (row) => `${row.num}:${row.slot}`

/** 候補一覧 → 依頼文の列 (PROMPT_BATCH_SIZE 行ずつ) */
export function toPromptBatches(rows, size = PROMPT_BATCH_SIZE) {
  const batches = []
  for (let i = 0; i < rows.length; i += size) {
    const lines = rows
      .slice(i, i + size)
      .map((r) => [rowId(r), r.word, r.kana, r.candidates.join('/')].join('\t'))
    batches.push(`${PROMPT_HEADER}\n${lines.join('\n')}\n`)
  }
  return batches
}

const ANSWER_LINE = /^\s*(\d{3}:[A-Za-z0-9_]+)\s+(\S+)\s*$/

/** LLM の答え → {id, to} の列。形の合わない行 (前置きなど) は捨てる */
export function parseAnswers(text) {
  return String(text ?? '')
    .split('\n')
    .map((line) => line.match(ANSWER_LINE))
    .filter(Boolean)
    .map(([, id, to]) => ({ id, to }))
}

/**
 * 答えを候補と突き合わせる。候補に無いよみ・知らない id・同じ id の食い違いは弾く
 * @returns {{accepted: {num, slot, word, from, to}[], rejected: {id, to, reason}[]}}
 */
export function validateAnswers(answers, rows) {
  const byId = new Map(rows.map((r) => [rowId(r), r]))
  const chosen = new Map()
  const rejected = []
  for (const { id, to } of answers) {
    const row = byId.get(id)
    if (!row)
      rejected.push({ id, to, reason: '候補に無い枠 (直し済みか番号違い)' })
    else if (!row.candidates.includes(to))
      rejected.push({ id, to, reason: '候補に無いよみ' })
    else if (chosen.has(id) && chosen.get(id) !== to)
      rejected.push({ id, to, reason: '同じ枠に別の答え' })
    else chosen.set(id, to)
  }
  const accepted = [...chosen].map(([id, to]) => {
    const { num, slot, word, kana } = byId.get(id)
    return { num, slot, word, from: kana, to }
  })
  return { accepted, rejected }
}

/** DB の番号文書への書き換え。今のかなが words.tsv のとき (from) と同じ枠だけ書く */
export function planLongDb(docs, accepted) {
  const byNum = new Map()
  for (const change of accepted) {
    const doc = docs[change.num]
    if (text(doc?.slots?.[change.slot]?.kana) !== change.from) continue
    const entry = byNum.get(change.num) ?? {
      num: change.num,
      current: doc,
      next: { ...doc, slots: { ...doc.slots } },
      changes: [],
    }
    entry.next.slots[change.slot] = {
      ...entry.next.slots[change.slot],
      kana: change.to,
    }
    entry.changes.push(change)
    byNum.set(change.num, entry)
  }
  return [...byNum.values()]
}

/**
 * シート 999 タブへの書き換え。values は 1 行目が見出しの 2 次元配列。今のセルが from と同じものだけ
 * @returns {{cell, num, slot, before, after}[]}
 */
export function planLongSheet(values, accepted) {
  const header = (values[0] ?? []).map((h) => text(h))
  const numCol = header.indexOf('num') >= 0 ? header.indexOf('num') : 0
  const rowOf = new Map(values.slice(1).map((row, i) => [text(row[numCol]), i]))
  return accepted.flatMap(({ num, slot, from, to }) => {
    const col = header.indexOf(`${slot}k`)
    const i = rowOf.get(num)
    if (col < 0 || i === undefined) return []
    const before = text(values[i + 1][col])
    if (before !== from) return []
    return [
      { cell: `${columnName(col)}${i + 2}`, num, slot, before, after: to },
    ]
  })
}
