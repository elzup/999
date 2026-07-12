// 辞書本体は公開 hosting には無く、認証付き Cloud Function 経由でのみ取得する。
// 未認証 (トークン無効/無し) の場合は 401 が返り、呼び出し側は Locked 画面へ倒す。

export class UnauthorizedError extends Error {
  constructor() {
    super('unauthorized')
    this.name = 'UnauthorizedError'
  }
}

async function fetchGated<T>(path: string, token: string): Promise<T> {
  const res = await fetch(path, {
    headers: { authorization: `Bearer ${token}` },
  })

  if (res.status === 401) throw new UnauthorizedError()
  if (!res.ok) throw new Error(`データ取得に失敗しました (${res.status})`)

  return (await res.json()) as T
}

/** 辞書本体 (numbers / cards / rules) を認証付きで取得する。 */
export function fetchAppData(token: string): Promise<unknown> {
  return fetchGated('/api/app/data', token)
}
