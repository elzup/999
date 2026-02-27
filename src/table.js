/** 1桁: かな → 数字 */
export const SINGLE_DIGIT = {
  // core
  れ: 0,
  い: 1,
  に: 2,
  さ: 3,
  し: 4,
  こ: 5,
  ろ: 6,
  な: 7,
  は: 8,
  き: 9,
  // sub
  お: 0,
  ひ: 1,
  ふ: 2,
  み: 3,
  よ: 4,
  ら: 5,
  る: 6,
  う: 7,
  や: 8,
  く: 9,
  // bad
  あ: 8,
  か: 9,
  を: 0,
}

/** 2桁: かな → 数字文字列 (キーはすべてひらがな) */
export const DOUBLE_DIGIT = {
  ま: '00',
  と: '10',
  てぃ: '12',
  ひょ: '14',
  ひゅ: '17',
  とぅ: '17',
  ひゃ: '18',
  いぇ: '18',
  ふぃ: '21',
  ち: '22',
  つ: '23',
  ちょ: '24',
  ちゅ: '27',
  ちゃ: '28',
  つぁ: '28',
  つぇ: '29',
  ちぇ: '29',
  す: '33',
  みょ: '34',
  そ: '35',
  みゅ: '37',
  みゃ: '38',
  せ: '39',
  ゆ: '43',
  しょ: '44',
  しゅ: '47',
  しゃ: '48',
  しぇ: '49',
  ふぉ: '54',
  た: '55',
  てゅ: '57',
  ふぁ: '58',
  て: '59',
  ふぇ: '59',
  り: '61',
  む: '63',
  りょ: '64',
  じょ: '64',
  も: '65',
  りゅ: '67',
  じゅ: '67',
  りゃ: '68',
  じゃ: '68',
  め: '69',
  うぃ: '71',
  ゔぃ: '71',
  ぬ: '73',
  にょ: '74',
  うぉ: '74',
  の: '75',
  にゅ: '77',
  うぁ: '78',
  にゃ: '78',
  ね: '79',
  うぇ: '79',
  ほ: '85',
  わ: '88',
  へ: '89',
  きょ: '94',
  きゅ: '97',
  きゃ: '98',
  け: '99',
}

/** 濁音→清音 (ジャジュジョは例外として DOUBLE_DIGIT に直接登録済み) */
const DAKUTEN_MAP = {
  が: 'か',
  ぎ: 'き',
  ぐ: 'く',
  げ: 'け',
  ご: 'こ',
  ざ: 'さ',
  じ: 'し',
  ず: 'す',
  ぜ: 'せ',
  ぞ: 'そ',
  だ: 'た',
  ぢ: 'ち',
  づ: 'つ',
  で: 'て',
  ど: 'と',
  ば: 'は',
  び: 'ひ',
  ぶ: 'ふ',
  べ: 'へ',
  ぼ: 'ほ',
  ぱ: 'は',
  ぴ: 'ひ',
  ぷ: 'ふ',
  ぺ: 'へ',
  ぽ: 'ほ',
  ガ: 'か',
  ギ: 'き',
  グ: 'く',
  ゲ: 'け',
  ゴ: 'こ',
  ザ: 'さ',
  ジ: 'し',
  ズ: 'す',
  ゼ: 'せ',
  ゾ: 'そ',
  ダ: 'た',
  ヂ: 'ち',
  ヅ: 'つ',
  デ: 'て',
  ド: 'と',
  バ: 'は',
  ビ: 'ひ',
  ブ: 'ふ',
  ベ: 'へ',
  ボ: 'ほ',
  パ: 'は',
  ピ: 'ひ',
  プ: 'ふ',
  ペ: 'へ',
  ポ: 'ほ',
}

const DAKUTEN_YOUON_EXCEPTIONS = {
  じゃ: 'じゃ',
  じゅ: 'じゅ',
  じょ: 'じょ',
  ジャ: 'ジャ',
  ジュ: 'ジュ',
  ジョ: 'ジョ',
}

/** 1桁かなのティア */
export const SINGLE_TIER = {
  れ: 'core',
  い: 'core',
  に: 'core',
  さ: 'core',
  し: 'core',
  こ: 'core',
  ろ: 'core',
  な: 'core',
  は: 'core',
  き: 'core',
  お: 'sub',
  ひ: 'sub',
  ふ: 'sub',
  み: 'sub',
  よ: 'sub',
  ら: 'sub',
  る: 'sub',
  う: 'sub',
  や: 'sub',
  く: 'sub',
  あ: 'bad',
  か: 'bad',
  を: 'bad',
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
