/** 1桁: かな → 数字 */
const SINGLE_DIGIT = {
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

/** 2桁: かな → 数字文字列 */
const DOUBLE_DIGIT = {
  ま: '00',
  と: '10',
  ティ: '12',
  ヒョ: '14',
  ヒュ: '17',
  トゥ: '17',
  ヒャ: '18',
  イェ: '18',
  フィ: '21',
  ち: '22',
  つ: '23',
  チョ: '24',
  チュ: '27',
  チャ: '28',
  ツァ: '28',
  ツェ: '29',
  チェ: '29',
  す: '33',
  ミョ: '34',
  そ: '35',
  ミュ: '37',
  ミャ: '38',
  せ: '39',
  ゆ: '43',
  ショ: '44',
  シュ: '47',
  シャ: '48',
  シェ: '49',
  フォ: '54',
  た: '55',
  テュ: '57',
  ファ: '58',
  て: '59',
  フェ: '59',
  り: '61',
  む: '63',
  リョ: '64',
  ジョ: '64',
  も: '65',
  リュ: '67',
  ジュ: '67',
  リャ: '68',
  ジャ: '68',
  め: '69',
  ウィ: '71',
  ヴィ: '71',
  ぬ: '73',
  ニョ: '74',
  ウォ: '74',
  の: '75',
  ニュ: '77',
  ウァ: '78',
  ニャ: '78',
  ね: '79',
  ウェ: '79',
  ほ: '85',
  わ: '88',
  へ: '89',
  キョ: '94',
  キュ: '97',
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
  ガ: 'カ',
  ギ: 'キ',
  グ: 'ク',
  ゲ: 'ケ',
  ゴ: 'コ',
  ザ: 'サ',
  ジ: 'シ',
  ズ: 'ス',
  ゼ: 'セ',
  ゾ: 'ソ',
  ダ: 'タ',
  ヂ: 'チ',
  ヅ: 'ツ',
  デ: 'テ',
  ド: 'ト',
  バ: 'ハ',
  ビ: 'ヒ',
  ブ: 'フ',
  ベ: 'ヘ',
  ボ: 'ホ',
  パ: 'ハ',
  ピ: 'ヒ',
  プ: 'フ',
  ペ: 'ヘ',
  ポ: 'ホ',
}

const DAKUTEN_YOUON_EXCEPTIONS = { ジャ: 'ジャ', ジュ: 'ジュ', ジョ: 'ジョ' }

/** カタカナ→ひらがな (基本50音) */
const KATA_TO_HIRA = {}
for (let i = 0x30a1; i <= 0x30f6; i++) {
  KATA_TO_HIRA[String.fromCharCode(i)] = String.fromCharCode(i - 0x60)
}

function normalizeDakuten(token) {
  if (DAKUTEN_YOUON_EXCEPTIONS[token]) return token
  return [...token].map((ch) => DAKUTEN_MAP[ch] ?? ch).join('')
}

function kataToHira(ch) {
  return KATA_TO_HIRA[ch] ?? ch
}

function buildReverseTable() {
  const rev = {}
  for (const [kana, digit] of Object.entries(SINGLE_DIGIT)) {
    const key = String(digit)
    rev[key] = [...(rev[key] ?? []), kana]
  }
  for (const [kana, digits] of Object.entries(DOUBLE_DIGIT)) {
    rev[digits] = [...(rev[digits] ?? []), kana]
  }
  return rev
}

module.exports = {
  SINGLE_DIGIT,
  DOUBLE_DIGIT,
  normalizeDakuten,
  kataToHira,
  buildReverseTable,
}
