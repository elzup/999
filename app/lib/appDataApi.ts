// 辞書本体は公開 hosting には無く、認証付き Cloud Function 経由でのみ取得する。
// 未認証 (トークン無効/無し) の場合は 401 が返り、呼び出し側は Locked 画面へ倒す。

export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized')
    this.name = 'UnauthorizedError'
  }
}

// ロード画面に出す進捗。接続 (TTFB) → 受信 (バイト数) → 展開 (JSON.parse) の 3 段。
// gzip 時は content-length が無い (chunked) ことがあるので totalBytes は null がありうる
export type AppDataProgress =
  | { phase: 'connecting' }
  | { phase: 'downloading'; loadedBytes: number; totalBytes: number | null }
  | { phase: 'parsing' }

// text (生 JSON) も返すのは、呼び出し側がキャッシュとの一致判定と保存に使うため
export type AppDataPayload = { text: string; json: unknown }

async function readBodyWithProgress(
  res: Response,
  onProgress?: (progress: AppDataProgress) => void
): Promise<string> {
  // ReadableStream 非対応環境は進捗なしで一括取得に倒す
  if (!res.body) return res.text()

  const totalHeader = Number(res.headers.get('content-length'))
  const totalBytes = totalHeader > 0 ? totalHeader : null
  const reader = res.body.getReader()
  const chunks: Uint8Array[] = []
  let loadedBytes = 0

  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    chunks.push(value)
    loadedBytes += value.byteLength
    onProgress?.({ phase: 'downloading', loadedBytes, totalBytes })
  }

  const body = new Uint8Array(loadedBytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new TextDecoder().decode(body)
}

/** 辞書本体 (numbers / cards / rules) を認証付きで取得する。 */
export async function fetchAppData(
  token: string,
  onProgress?: (progress: AppDataProgress) => void
): Promise<AppDataPayload> {
  onProgress?.({ phase: 'connecting' })
  const res = await fetch('/api/app/data', {
    headers: { authorization: `Bearer ${token}` },
  })

  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`データ取得に失敗しました (${res.status})`)

  const text = await readBodyWithProgress(res, onProgress)
  onProgress?.({ phase: 'parsing' })
  return { text, json: JSON.parse(text) }
}
