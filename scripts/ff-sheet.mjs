// FF シート読み取りの共有ヘルパ(認証フォールバック + 取得)。
// FF シートは granted SA (~/.config/million-aniv/sa-key.json) 経由でのみ読める。
import { existsSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const FALLBACK_KEY = join(homedir(), '.config', 'million-aniv', 'sa-key.json')
if (
  !process.env.GOOGLE_SERVICE_ACCOUNT_PATH &&
  !process.env.GOOGLE_SERVICE_ACCOUNT_JSON &&
  !process.env.GOOGLE_OAUTH_ACCESS_TOKEN &&
  existsSync(FALLBACK_KEY)
) {
  process.env.GOOGLE_SERVICE_ACCOUNT_PATH = FALLBACK_KEY
}

const { getSheetValuesByTitle } = await import('../src/google-sheets.js')

export const FF_SHEET_ID = '1F2G4-6lqUPeYzHkpbhUtYKgDzrjNuUo8tbjXKyrzFHM'

/** データ行(num 0..255): [num, hex, type, bin, exp, F(参照), G(人), H(物)] */
export async function readFfRows() {
  return getSheetValuesByTitle({
    spreadsheetId: FF_SHEET_ID,
    title: 'FF',
    range: 'A3:H258',
  })
}
