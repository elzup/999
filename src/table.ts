/** 1桁: かな → 数字 */
export const SINGLE_DIGIT: Record<string, number> = {
  // core
  れ: 0, い: 1, に: 2, さ: 3, し: 4, こ: 5, ろ: 6, な: 7, は: 8, き: 9,
  // sub
  お: 0, ひ: 1, ふ: 2, み: 3, よ: 4, る: 6, う: 7, や: 8, く: 9,
  // bad
  あ: 8, か: 9,
};

/** 2桁: かな → 数字文字列 */
export const DOUBLE_DIGIT: Record<string, string> = {
  // 0_
  ま: "00",
  // 1_
  と: "10", ティ: "12", ヒョ: "14", ヒュ: "17", トゥ: "17", ヒャ: "18", イェ: "18",
  // 2_
  フィ: "21", ち: "22", つ: "23", チョ: "24", チュ: "27", チャ: "28", ツァ: "28", ツェ: "29", チェ: "29",
  // 3_
  す: "33", ミョ: "34", そ: "35", ミュ: "37", ミャ: "38", せ: "39",
  // 4_
  ゆ: "43", ショ: "44", シュ: "47", シャ: "48", シェ: "49",
  // 5_
  フォ: "54", た: "55", テュ: "57", ファ: "58", て: "59", フェ: "59",
  // 6_
  り: "61", む: "63", リョ: "64", ジョ: "64", も: "65", リュ: "67", ジュ: "67", リャ: "68", ジャ: "68", め: "69",
  // 7_
  ウィ: "71", ヴィ: "71", ぬ: "73", ニョ: "74", ウォ: "74", の: "75", ニュ: "77", ウァ: "78", ニャ: "78", ね: "79", ウェ: "79",
  // 8_
  ほ: "85", わ: "88", へ: "89",
  // 9_
  キョ: "94", キュ: "97", きゃ: "98", け: "99",
};

/** 濁音→清音マッピング（ジャジュジョは例外: 独自の値を持つ） */
const DAKUTEN_MAP: Record<string, string> = {
  が: "か", ぎ: "き", ぐ: "く", げ: "け", ご: "こ",
  ざ: "さ", じ: "し", ず: "す", ぜ: "せ", ぞ: "そ",
  だ: "た", ぢ: "ち", づ: "つ", で: "て", ど: "と",
  ば: "は", び: "ひ", ぶ: "ふ", べ: "へ", ぼ: "ほ",
  ぱ: "は", ぴ: "ひ", ぷ: "ふ", ぺ: "へ", ぽ: "ほ",
  ガ: "カ", ギ: "キ", グ: "ク", ゲ: "ケ", ゴ: "コ",
  ザ: "サ", ジ: "シ", ズ: "ス", ゼ: "セ", ゾ: "ソ",
  ダ: "タ", ヂ: "チ", ヅ: "ツ", デ: "テ", ド: "ト",
  バ: "ハ", ビ: "ヒ", ブ: "フ", ベ: "ヘ", ボ: "ホ",
  パ: "ハ", ピ: "ヒ", プ: "フ", ペ: "ヘ", ポ: "ホ",
};

/** ジャジュジョ例外: 濁音だが独自のマッピングを持つ拗音 */
const DAKUTEN_YOUON_EXCEPTIONS: Record<string, string> = {
  ジャ: "ジャ", ジュ: "ジュ", ジョ: "ジョ",
};

/** カタカナ→ひらがな変換（基本50音のみ） */
const KATA_TO_HIRA: Record<string, string> = {};
for (let i = 0x30A1; i <= 0x30F6; i++) {
  const kata = String.fromCharCode(i);
  const hira = String.fromCharCode(i - 0x60);
  KATA_TO_HIRA[kata] = hira;
}

/**
 * 濁音を清音に変換する。ジャジュジョ拗音は例外として保持。
 * カタカナ専用音（ティ, フィ等）はそのまま。
 */
export function normalizeDakuten(token: string): string {
  if (DAKUTEN_YOUON_EXCEPTIONS[token]) return token;

  return [...token]
    .map((ch) => DAKUTEN_MAP[ch] ?? ch)
    .join("");
}

/**
 * カタカナ→ひらがな変換。テーブルにカタカナで登録されたもの（ティ, フィ等）は変換しない。
 */
export function kataToHira(ch: string): string {
  return KATA_TO_HIRA[ch] ?? ch;
}

/**
 * 全テーブルから逆引きマップを生成: 数字文字列 → かな候補の配列
 */
export function buildReverseTable(): Record<string, string[]> {
  const rev: Record<string, string[]> = {};

  for (const [kana, digit] of Object.entries(SINGLE_DIGIT)) {
    const key = String(digit);
    if (!rev[key]) rev[key] = [];
    rev[key] = [...rev[key], kana];
  }

  for (const [kana, digits] of Object.entries(DOUBLE_DIGIT)) {
    if (!rev[digits]) rev[digits] = [];
    rev[digits] = [...rev[digits], kana];
  }

  return rev;
}
