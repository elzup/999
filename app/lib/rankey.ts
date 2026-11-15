// rankey は保存値を読まず、見る場所でかな・番号・語から計算する (D-0045)。
// 計算の実体は src/rankey.js 1 か所 (規則表は vite がバンドルに埋め込む)
import { rankey } from '../../src/rankey.js'

/** かなが空なら undefined。規則表で読めないかなも undefined (表示しない) */
export function rankeyOf(
  kana: string | undefined,
  num: string,
  word = ''
): string | undefined {
  const reading = (kana ?? '').trim()
  if (!reading) return undefined
  return rankey(reading, num, word) ?? undefined
}
