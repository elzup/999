// FF(00-FF hex) の読み生成 共有ロジック(純関数)。
// gen-ff-lyrics.mjs / gen-ff-json.mjs / app(FFTab) が同じ規則を使うための単一の正本。
//   NC/CN: hex名前読み + 参照の括弧内かな   (B3 -> びーさん + いいさ)
//   NN/CC: 語読み(F括弧内 or G/H)
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

/** 行の代表読み(歌詞・テストで使う1つ) */
export function rowReading(row) {
  const type = clean(row[2])
  const F = clean(row[5])
  const G = clean(row[6])
  const H = clean(row[7])
  if (type === 'NC' || type === 'CN') return phoneticFor(row[1], F)
  if (usable(F)) return parenInner(F) // NN
  if (usable(G)) return stripTags(G) // CC(人)
  if (usable(H)) return stripTags(H) // CC(物)
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
  if (usable(F)) {
    word = wordPart(F)
    kana = parenInner(F)
  } else if (usable(G)) {
    word = stripTags(G)
    kana = word
  } else if (usable(H)) {
    word = stripTags(H)
    kana = word
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
