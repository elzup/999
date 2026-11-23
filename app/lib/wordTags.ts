// 語の文字列に埋め込まれたタグ (#xxx) とラベル (-a 等) の読み書き。
//
// シートでは 1 つのセルに «本体(注)#タグ#タグ -ラベル» と連結して書く
// (例: ロッシ#enfi -a)。編集フォームでは本体・タグ・ラベルを別々に扱い、
// 保存するときだけ連結記法に戻す。
//
// 付け外しは文字列の該当部分だけを書き換える。全体を組み立て直すと、
// 人が書いた並び (ラベルとタグの順や空白) まで変わり、シートの差分が膨らむ。

/** タグの文字。tags.ts の TAG_RE と同じ (区切りは空白・#・カンマ) */
const TAG_RE = /#([^\s#,]+)/g
/** ラベルは空白の後の «-英小文字1字»。rankey.js#cleanWord と同じ */
const LABEL_RE = /(^|\s)-([a-z])(?=\s|$)/g

export type ParsedWord = {
  /** タグとラベルを除いた本体 (注釈の括弧は残す) */
  base: string
  tags: string[]
  labels: string[]
}

export function parseWord(word: string): ParsedWord {
  const raw = String(word ?? '')
  const tags = [...new Set([...raw.matchAll(TAG_RE)].map((m) => m[1]))]
  const labels = [...new Set([...raw.matchAll(LABEL_RE)].map((m) => m[2]))]
  const base = raw
    .replace(TAG_RE, '')
    .replace(LABEL_RE, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return { base, tags, labels }
}

/** 本体の終わり (最初のタグ «#» かラベル « -a» の手前)。注釈の括弧は本体に含む */
function baseEnd(word: string): number {
  const tag = word.indexOf('#')
  const label = word.search(/\s-[a-z](?=\s|#|$)/)
  const ends = [tag, label].filter((at) => at >= 0)
  return ends.length ? Math.min(...ends) : word.length
}

/**
 * 編集欄に出す本体 (タグ・ラベルの手前まで、書かれたまま)。
 * parseWord の base と違い空白を詰めないので、打った字がそのまま欄に残る
 */
export function baseText(word: string): string {
  return word.slice(0, baseEnd(word))
}

/**
 * 本体だけを書き換える。タグ・ラベルは元の並びのまま残す。
 * 欄で «#» を打ってもタグにはしない (タグはチップでだけ付け外す: D-0133)
 */
export function setBase(word: string, base: string): string {
  return base.replace(/#/g, '') + word.slice(baseEnd(word))
}

/** タグとして入れてよい文字列か。区切り文字を含むと別のタグに割れる */
export function normalizeTag(input: string): string {
  return input
    .trim()
    .replace(/^#+/, '')
    .replace(/[\s#,]/g, '')
}

/** 末尾のラベル群 ( -a -x) の手前の位置。タグはラベルより前に置く */
function labelTailStart(word: string): number {
  const match = word.match(/(\s+-[a-z])+\s*$/)
  return match ? word.length - match[0].length : word.trimEnd().length
}

export function addTag(word: string, input: string): string {
  const tag = normalizeTag(input)
  if (!tag || parseWord(word).tags.includes(tag)) return word
  const at = labelTailStart(word)
  return word.slice(0, at) + `#${tag}` + word.slice(at)
}

export function removeTag(word: string, tag: string): string {
  const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return word
    .replace(new RegExp(`#${escaped}(?=[\\s#,]|$)`, 'g'), '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

export function addLabel(word: string, label: string): string {
  if (!/^[a-z]$/.test(label) || parseWord(word).labels.includes(label)) {
    return word
  }
  return `${word.trimEnd()} -${label}`
}

export function removeLabel(word: string, label: string): string {
  return word
    .replace(new RegExp(`(^|\\s)-${label}(?=\\s|$)`, 'g'), '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

/** docs/num-actions.md §6 のラベル一覧 */
/**
 * retired: 新しくは付けないラベル。付いている語では表示と取り外しだけできる。
 * -n (馴染みがない) は主観評価 -1 と同じものなので評価のほうで付ける (nr label:n で移行済み)
 */
export const LABELS: Array<{ id: string; meaning: string; retired?: boolean }> =
  [
    { id: 'x', meaning: '語呂強引' },
    { id: 'r', meaning: '連想' },
    { id: 'n', meaning: '馴染みがない', retired: true },
    { id: 'u', meaning: '愛称・ユニーク' },
    { id: 'a', meaning: '余りあり' },
    { id: 'm', meaning: '同数異音混在' },
    { id: 's', meaning: 'サンド・中抜き' },
    { id: 'p', meaning: '0xx' },
    { id: 'j', meaning: '熟語' },
  ]

/** name はシートの tags タブの表示名 (res → アトリエ)。無いタグもある */
export type TagSuggestion = { tag: string; count: number; name?: string }

// 半角カナ・全角英数・大文字小文字の違いで当たらないことが無いようにそろえる
const foldForSearch = (text: string) => text.normalize('NFKC').toLowerCase()

/**
 * 入力中の文字に合うタグ候補。タグ (id) と表示名のどちらにも当てる
 * («アトリエ» と打って #res を出せるように)。前方一致を先に、その中は使われている
 * 回数の多い順。既に付いているタグは出さない
 */
export function suggestTags(
  known: TagSuggestion[],
  input: string,
  exclude: string[],
  limit = 8
): TagSuggestion[] {
  const q = foldForSearch(normalizeTag(input))
  const pool = known.filter((item) => !exclude.includes(item.tag))
  if (!q) return pool.slice(0, limit)
  const keysOf = (item: TagSuggestion) =>
    [item.tag, item.name ?? ''].filter(Boolean).map(foldForSearch)
  const head = pool.filter((item) => keysOf(item).some((k) => k.startsWith(q)))
  const mid = pool.filter(
    (item) => !head.includes(item) && keysOf(item).some((k) => k.includes(q))
  )
  return [...head, ...mid].slice(0, limit)
}

/** タグの意味。表に無いタグはそのまま «#tri» と出す */
export const TAG_MEANINGS: Record<string, string> = {
  g: '概念',
  i: '身内',
}

/** «#g 概念» «-n 馴染みがない» のような意味の一覧 (詳細カードで語をタップしたとき) */
export function marksMeaning(
  tags: string[],
  labels: string[],
  names: Record<string, string> = {}
): string[] {
  return [
    // タグは表示名 (short_title → title)。無ければ組み込みの意味、それも無ければ id
    ...tags.map((t) => names[t] ?? TAG_MEANINGS[t] ?? t),
    ...labels.map((l) => {
      const meaning = LABELS.find((x) => x.id === l)?.meaning
      return meaning ? `-${l} ${meaning}` : `-${l}`
    }),
  ]
}
