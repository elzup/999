import {
  SINGLE_DIGIT,
  DOUBLE_DIGIT,
  normalizeDakuten,
  kataToHira,
} from "./table";

export type Token = { kana: string; value: string };
export type EncodeResult = { digits: string; tokens: Token[] };

/** テーブルからかなを検索（カタカナ原文 → 濁音正規化 → ひらがな化 の順で試す） */
function lookup(token: string): string | undefined {
  // カタカナ表記そのままで2桁テーブルにあるか（ティ, フィ, ジャ等）
  if (DOUBLE_DIGIT[token] !== undefined) return DOUBLE_DIGIT[token];

  // 濁音正規化して2桁テーブル
  const normalized = normalizeDakuten(token);
  if (DOUBLE_DIGIT[normalized] !== undefined) return DOUBLE_DIGIT[normalized];

  // ひらがな化して2桁テーブル
  const hira = [...normalized].map(kataToHira).join("");
  if (DOUBLE_DIGIT[hira] !== undefined) return DOUBLE_DIGIT[hira];

  // 1桁テーブル（1文字のみ）
  if (token.length === 1) {
    const ch = kataToHira(normalizeDakuten(token));
    if (SINGLE_DIGIT[ch] !== undefined) return String(SINGLE_DIGIT[ch]);
  }

  return undefined;
}

/**
 * かな文字列を数字列に変換する。
 * 貪欲法で2文字（拗音・外来音）→1文字の順にマッチ。
 */
export function encode(input: string): EncodeResult {
  const tokens: Token[] = [];
  let i = 0;

  while (i < input.length) {
    // 2文字マッチを優先
    if (i + 1 < input.length) {
      const two = input.slice(i, i + 2);
      const val = lookup(two);
      if (val !== undefined) {
        tokens.push({ kana: two, value: val });
        i += 2;
        continue;
      }
    }

    // 1文字マッチ
    const one = input[i];
    const val = lookup(one);
    if (val === undefined) {
      throw new Error(`Unknown kana: "${one}" at position ${i}`);
    }
    tokens.push({ kana: one, value: val });
    i += 1;
  }

  const digits = tokens.map((t) => t.value).join("");
  return { digits, tokens };
}

/** 桁数だけ返す便利関数 */
export function countDigits(input: string): number {
  return encode(input).digits.length;
}

/** 3桁(100-999)になるか判定 */
export function isThreeDigits(input: string): boolean {
  const { digits } = encode(input);
  return digits.length === 3 && digits[0] !== "0";
}
