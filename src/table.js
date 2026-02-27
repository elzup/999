// prettier-ignore
/** 1桁: かな → 数字 (ティア別・五十音順) */
export const SINGLE_DIGIT = {
  // core
  い: 1, き: 9, こ: 5, さ: 3, し: 4, な: 7, に: 2, は: 8, れ: 0, ろ: 6,
  // sub
  う: 7, お: 0, く: 9, ひ: 1, ふ: 2, み: 3, よ: 4, ら: 5, る: 6, や: 8,
  // bad
  あ: 8, か: 9, を: 0,
}

// prettier-ignore
/** 2桁: かな → 数字文字列 (五十音順・キーはすべてひらがな) */
export const DOUBLE_DIGIT = {
  // あ行
  いぇ: '18',
  // か行
  け: '99', きゃ: '98', きゅ: '97', きょ: '94',
  // さ行
  す: '33', せ: '39', そ: '35',
  しゃ: '48', しゅ: '47', しぇ: '49', しょ: '44',
  // た行
  た: '55', ち: '22', つ: '23', て: '59', と: '10',
  ちゃ: '28', ちゅ: '27', ちぇ: '29', ちょ: '24',
  つぁ: '28', つぇ: '29',
  てぃ: '12', てゅ: '57', とぅ: '17',
  // な行
  ぬ: '73', ね: '79', の: '75',
  にゃ: '78', にゅ: '77', にょ: '74',
  // は行
  ほ: '85', へ: '89',
  ひゃ: '18', ひゅ: '17', ひょ: '14',
  ふぁ: '58', ふぃ: '21', ふぇ: '59', ふぉ: '54',
  // ま行
  ま: '00', む: '63', め: '69', も: '65',
  みゃ: '38', みゅ: '37', みょ: '34',
  // や行
  ゆ: '43',
  // ら行
  り: '61', りゃ: '68', りゅ: '67', りょ: '64',
  // わ行
  わ: '88',
  // 濁音 (じゃ行)
  じゃ: '68', じゅ: '67', じょ: '64',
  // 外来音
  うぁ: '78', うぃ: '71', うぇ: '79', うぉ: '74', ゔぃ: '71',
}

// prettier-ignore
/** 濁音→清音 (五十音順・5文字ずつ行単位) */
const DAKUTEN_MAP = {
  // ひらがな濁音
  が:'か', ぎ:'き', ぐ:'く', げ:'け', ご:'こ',
  ざ:'さ', じ:'し', ず:'す', ぜ:'せ', ぞ:'そ',
  だ:'た', ぢ:'ち', づ:'つ', で:'て', ど:'と',
  ば:'は', び:'ひ', ぶ:'ふ', べ:'へ', ぼ:'ほ',
  // ひらがな半濁音
  ぱ:'は', ぴ:'ひ', ぷ:'ふ', ぺ:'へ', ぽ:'ほ',
  // カタカナ濁音
  ガ:'か', ギ:'き', グ:'く', ゲ:'け', ゴ:'こ',
  ザ:'さ', ジ:'し', ズ:'す', ゼ:'せ', ゾ:'そ',
  ダ:'た', ヂ:'ち', ヅ:'つ', デ:'て', ド:'と',
  バ:'は', ビ:'ひ', ブ:'ふ', ベ:'へ', ボ:'ほ',
  // カタカナ半濁音
  パ:'は', ピ:'ひ', プ:'ふ', ペ:'へ', ポ:'ほ',
}

// prettier-ignore
const DAKUTEN_YOUON_EXCEPTIONS = {
  じゃ:'じゃ', じゅ:'じゅ', じょ:'じょ',
  ジャ:'ジャ', ジュ:'ジュ', ジョ:'ジョ',
}

// prettier-ignore
/** 1桁かなのティア (五十音順) */
export const SINGLE_TIER = {
  // core
  い:'core', き:'core', こ:'core', さ:'core', し:'core',
  な:'core', に:'core', は:'core', れ:'core', ろ:'core',
  // sub
  う:'sub', お:'sub', く:'sub', ひ:'sub', ふ:'sub',
  み:'sub', よ:'sub', ら:'sub', る:'sub', や:'sub',
  // bad
  あ:'bad', か:'bad', を:'bad',
}

/** カタカナ→ひらがな (基本50音) */
const KATA_TO_HIRA = Object.fromEntries(
  Array.from({ length: 0x30f6 - 0x30a1 + 1 }, (_, i) => {
    const code = 0x30a1 + i
    return [String.fromCharCode(code), String.fromCharCode(code - 0x60)]
  })
)

export function normalizeDakuten(token) {
  if (DAKUTEN_YOUON_EXCEPTIONS[token]) return token
  return [...token].map((ch) => DAKUTEN_MAP[ch] ?? ch).join('')
}

export function kataToHira(ch) {
  return KATA_TO_HIRA[ch] ?? ch
}

export function buildReverseTable() {
  const addEntry = (acc, key, kana) => ({
    ...acc,
    [key]: [...(acc[key] ?? []), kana],
  })

  const fromSingle = Object.entries(SINGLE_DIGIT).reduce(
    (acc, [kana, digit]) => addEntry(acc, String(digit), kana),
    {}
  )

  return Object.entries(DOUBLE_DIGIT).reduce(
    (acc, [kana, digits]) => addEntry(acc, digits, kana),
    fromSingle
  )
}
