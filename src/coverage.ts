import { SINGLE_DIGIT, DOUBLE_DIGIT, normalizeDakuten, kataToHira } from "./table";

/** 基本ひらがな50音（ん除く） */
const GOJUON = [
  "あ", "い", "う", "え", "お",
  "か", "き", "く", "け", "こ",
  "さ", "し", "す", "せ", "そ",
  "た", "ち", "つ", "て", "と",
  "な", "に", "ぬ", "ね", "の",
  "は", "ひ", "ふ", "へ", "ほ",
  "ま", "み", "む", "め", "も",
  "や", "ゆ", "よ",
  "ら", "り", "る", "れ", "ろ",
  "わ", "を",
] as const;

/** 濁音 */
const DAKUON = [
  "が", "ぎ", "ぐ", "げ", "ご",
  "ざ", "じ", "ず", "ぜ", "ぞ",
  "だ", "ぢ", "づ", "で", "ど",
  "ば", "び", "ぶ", "べ", "ぼ",
] as const;

/** 半濁音 */
const HANDAKUON = ["ぱ", "ぴ", "ぷ", "ぺ", "ぽ"] as const;

/** 拗音（清音ベース） */
const YOUON_BASE = ["き", "し", "ち", "に", "ひ", "み", "り"] as const;
const YOUON_SUFFIXES = ["ゃ", "ゅ", "ょ"] as const;

/** ジャジュジョ例外 */
const JA_JU_JO = ["ジャ", "ジュ", "ジョ"] as const;

type CoverageEntry = {
  kana: string;
  covered: boolean;
  value: string | null;
  note: string;
};

/** ひらがな→カタカナ変換（1文字） */
function hiraToKata(ch: string): string {
  const code = ch.charCodeAt(0);
  if (code >= 0x3041 && code <= 0x3096) return String.fromCharCode(code + 0x60);
  return ch;
}

function lookupValue(kana: string): string | null {
  if (DOUBLE_DIGIT[kana] !== undefined) return DOUBLE_DIGIT[kana];
  if (SINGLE_DIGIT[kana] !== undefined) return String(SINGLE_DIGIT[kana]);

  // カタカナ化して検索（拗音はカタカナでテーブル登録されている）
  const kata = [...kana].map(hiraToKata).join("");
  if (DOUBLE_DIGIT[kata] !== undefined) return DOUBLE_DIGIT[kata];

  // ひらがな化して検索
  const hira = [...kana].map(kataToHira).join("");
  if (DOUBLE_DIGIT[hira] !== undefined) return DOUBLE_DIGIT[hira];
  if (SINGLE_DIGIT[hira] !== undefined) return String(SINGLE_DIGIT[hira]);

  return null;
}

/** テーブルカバレッジレポートを生成 */
export function generateCoverage(): {
  gojuon: CoverageEntry[];
  dakuon: CoverageEntry[];
  handakuon: CoverageEntry[];
  youon: CoverageEntry[];
  exceptions: CoverageEntry[];
  summary: { total: number; covered: number; rate: number };
} {
  const entries: CoverageEntry[] = [];

  // 五十音
  const gojuon: CoverageEntry[] = GOJUON.map((kana) => {
    const value = lookupValue(kana);
    return {
      kana,
      covered: value !== null,
      value,
      note: value !== null ? `${kana}→${value}` : "未対応",
    };
  });
  entries.push(...gojuon);

  // 濁音（清音と同じ値）
  const dakuon: CoverageEntry[] = DAKUON.map((kana) => {
    const seion = normalizeDakuten(kana);
    const value = lookupValue(seion);
    return {
      kana,
      covered: value !== null,
      value,
      note: value !== null ? `${kana}→${seion}→${value}` : "未対応",
    };
  });
  entries.push(...dakuon);

  // 半濁音
  const handakuon: CoverageEntry[] = HANDAKUON.map((kana) => {
    const seion = normalizeDakuten(kana);
    const value = lookupValue(seion);
    return {
      kana,
      covered: value !== null,
      value,
      note: value !== null ? `${kana}→${seion}→${value}` : "未対応",
    };
  });
  entries.push(...handakuon);

  // 拗音
  const youon: CoverageEntry[] = YOUON_BASE.flatMap((base) =>
    YOUON_SUFFIXES.map((suffix) => {
      const kana = base + suffix;
      const value = lookupValue(kana);
      return {
        kana,
        covered: value !== null,
        value,
        note: value !== null ? `${kana}→${value}` : "未対応",
      };
    }),
  );
  entries.push(...youon);

  // ジャジュジョ例外
  const exceptions: CoverageEntry[] = JA_JU_JO.map((kana) => {
    const value = lookupValue(kana);
    return {
      kana,
      covered: value !== null,
      value,
      note: value !== null
        ? `${kana}→${value} (濁音例外: リャ行と同じ)`
        : "未対応",
    };
  });
  entries.push(...exceptions);

  const total = entries.length;
  const covered = entries.filter((e) => e.covered).length;

  return {
    gojuon,
    dakuon,
    handakuon,
    youon,
    exceptions,
    summary: { total, covered, rate: Math.round((covered / total) * 100) },
  };
}
