import { buildReverseTable } from "./table";

const reverseTable = buildReverseTable();

/** 数字文字列 → その数字に対応するかな候補一覧 */
export function getKanaForDigit(digit: string): string[] {
  return reverseTable[digit] ?? [];
}

/** 逆引きテーブル全体を返す */
export function getReverseTable(): Record<string, string[]> {
  return reverseTable;
}

type DecodeSplit = { parts: string[]; kanaOptions: string[][] };

/**
 * 数字列を1桁/2桁の組み合わせに分割し、各部分のかな候補を返す。
 * 全パターンを列挙する。
 */
export function decode(digits: string): DecodeSplit[] {
  const results: DecodeSplit[] = [];

  function dfs(pos: number, parts: string[], kanaOptions: string[][]) {
    if (pos === digits.length) {
      results.push({ parts: [...parts], kanaOptions: [...kanaOptions] });
      return;
    }

    // 1桁取り出し
    const one = digits[pos];
    const oneKana = reverseTable[one];
    if (oneKana && oneKana.length > 0) {
      dfs(pos + 1, [...parts, one], [...kanaOptions, oneKana]);
    }

    // 2桁取り出し
    if (pos + 1 < digits.length) {
      const two = digits.slice(pos, pos + 2);
      const twoKana = reverseTable[two];
      if (twoKana && twoKana.length > 0) {
        dfs(pos + 2, [...parts, two], [...kanaOptions, twoKana]);
      }
    }
  }

  dfs(0, [], []);
  return results;
}
