// rule-tsv.js のブラウザ版。vite が TSV を文字列としてバンドルに埋め込む
import single from './data/single_digit.tsv?raw'
import double from './data/double_digit.tsv?raw'
import long from './data/long_digit.tsv?raw'

export const SINGLE_DIGIT_TSV = single.trimEnd()
export const DOUBLE_DIGIT_TSV = double.trimEnd()
export const LONG_DIGIT_TSV = long.trimEnd()
