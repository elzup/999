// FF(00-FF hex) の読み生成 共有ロジック(純関数)。
// gen-ff-lyrics.mjs / gen-ff-json.mjs / app(FFTab) が同じ規則を使うための単一の正本。
//   NC/CN: hex名前読み + 参照の括弧内かな   (B3 -> びーさん + いいさ)
//   NN/CC: 語読み(G/H or F括弧内)
// row の並び: [num, hex, type, bin, exp, F(参照), G(人), H(物)]

// hex 各文字の名前読み(ひらがな)。数字=数字名、英字=アルファベット名。
export const HEX_NAME = {
  0: 'ぜろ',
  1: 'いち',
  2: 'に',
  3: 'さん',
  4: 'よん',
  5: 'ご',
  6: 'ろく',
  7: 'なな',
  8: 'はち',
  9: 'きゅう',
  A: 'えー',
  B: 'びー',
  C: 'しー',
  D: 'でぃー',
  E: 'いー',
  F: 'えふ',
}

const JUNK = new Set([
  '',
  '—',
  '#REF!',
  '#N/A',
  '#ERROR!',
  '#VALUE!',
  'FALSE',
  'TRUE',
])
const FF_TYPES = new Set(['NN', 'NC', 'CN', 'CC'])

export const clean = (s) => String(s ?? '').trim()
export const usable = (s) => Boolean(s) && !JUNK.has(s)

/** 生成元が 00-FF の完全な順序集合であることを確認する。 */
export function validateFfRows(rows) {
  if (rows.length !== 256) {
    throw new Error(`FF source must contain 256 rows; got ${rows.length}`)
  }
  rows.forEach((row, value) => {
    const expectedHex = value.toString(16).toUpperCase().padStart(2, '0')
    const expectedBin = value.toString(2).padStart(8, '0')
    if (
      clean(row[1]) !== expectedHex ||
      clean(row[3]) !== expectedBin ||
      !FF_TYPES.has(clean(row[2]))
    ) {
      throw new Error(`FF source row ${value} is invalid`)
    }
  })
  return rows
}

/** hex2桁を名前読みに (B3 -> びーさん, 0B -> ぜろびー) */
export function hexNameRead(hex) {
  return [...String(hex).toUpperCase()].map((c) => HEX_NAME[c] ?? c).join('')
}

/** かな括弧を取り出す。参照は「語（かな）」形式で、かなは末尾の全角（）。 */
export function parenInner(s) {
  const ms = [...String(s).matchAll(/（([^（）]+)）/g)]
  return (ms.length ? ms[ms.length - 1][1] : String(s)).trim()
}

/** 語尾タグを落とす: "#作品名"、" -a" ラベル、末尾 "|" */
export function stripTags(s) {
  return String(s)
    .replace(/#\S+/g, '')
    .replace(/\s*\|\s*$/g, '')
    .replace(/\s*-\w+\s*$/g, '')
    .trim()
}

/** 参照(F="語（かな）")の語部分(かな括弧を除く) */
export function wordPart(F) {
  return stripTags(String(F).replace(/（[^）]*）/g, ''))
}

/** NC/CN の読み = hex名前読み + 参照の括弧内かな */
export function phoneticFor(hex, F) {
  return hexNameRead(hex) + parenInner(F)
}

/** 半角括弧の読み注記も拾って かな部分だけにする ("キース(きいす)" -> "きいす") */
export function kanaOnly(s) {
  const ms = [...String(s).matchAll(/[（(]([^（）()]+)[）)]/g)]
  return (ms.length ? ms[ms.length - 1][1] : String(s)).trim()
}

/** 読み注記の括弧ごと落とす ("エア(air)" -> "エア") */
export function dropParen(s) {
  return String(s)
    .replace(/\s*[（(][^（）()]*[）)]\s*/g, '')
    .trim()
}

/**
 * 歌詞用の読み(hex名前読みの前半を付けない語だけの読み)。
 * NC/CN は参照 F のかな、F が空なら G(人)/H(物) の語で埋める。
 * CC/NN は代表読みから読み注記の括弧を落とす。
 */
export function lyricReading(row) {
  const type = clean(row[2])
  const F = clean(row[5])
  const G = clean(row[6])
  const H = clean(row[7])
  if (type === 'NC' || type === 'CN') {
    // かな括弧を先に取り出す。stripTags を先に掛けると "壱#asariri（いち）" の
    // ように #タグ とかな括弧が地続きの行でかなごと落ちる。
    if (usable(F)) return stripTags(kanaOnly(F))
    if (usable(G)) return stripTags(dropParen(G))
    if (usable(H)) return stripTags(dropParen(H))
    return '＿'
  }
  return dropParen(rowReading(row))
}

/** 行の代表読み(歌詞・テストで使う1つ) */
export function rowReading(row) {
  const type = clean(row[2])
  const F = clean(row[5])
  const G = clean(row[6])
  const H = clean(row[7])
  if (type === 'NC' || type === 'CN') return phoneticFor(row[1], F)
  if (usable(G)) return stripTags(G) // 人
  if (usable(H)) return stripTags(H) // 物
  if (usable(F)) return parenInner(F) // 参照
  return '＿'
}

/** 行を構造化: {hex,type,bin,exp,word,kana,read} */
export function buildRow(row) {
  const type = clean(row[2])
  const F = clean(row[5])
  const G = clean(row[6])
  const H = clean(row[7])
  let word = ''
  let kana = ''
  if (usable(G)) {
    word = stripTags(G)
    kana = word
  } else if (usable(H)) {
    word = stripTags(H)
    kana = word
  } else if (usable(F)) {
    word = wordPart(F)
    kana = parenInner(F)
  }
  return {
    hex: clean(row[1]),
    type,
    bin: clean(row[3]),
    exp: clean(row[4]),
    word,
    kana,
    read: rowReading(row),
  }
}
