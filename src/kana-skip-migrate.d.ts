// app から使う分だけの型 (本体は kana-skip-migrate.js)
/** よみから消してある読まないかなを、語 (かなだけの語) と突き合わせて半角カナで戻す。戻せなければ null */
export function restoreSkipFor(
  word: string,
  kana: string,
  num: string
): string | null
