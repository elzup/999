// シート ⇄ Firestore 双方向同期の状態を見る・今すぐ回す。
// サーバ側は functions/index.js の /sync/* (spec: design-sheet-bisync)

export type SyncConflict = {
  num: string
  field: string
  sheet: string
  db: string
  base: string
}

export type SyncHealthLevel =
  | 'ok'
  | 'conflict'
  | 'pending'
  | 'stale'
  | 'error'
  | 'never'

/** 判定は src/firestore/sync-status.js (CLI・シートの sync タブと同じ) */
export type SyncHealth = { level: SyncHealthLevel; label: string }

/** 指紋は 200 文字 (10 番号ずつ 2 文字)。src/firestore/fingerprint.js */
export type SyncSource = {
  fingerprint?: string
  contentUpdatedAt?: string | null
}

export type SyncState = {
  sources?: { sheet?: SyncSource; db?: SyncSource }
  lastRunAt?: string
  cursor?: string
  lastFullAt?: string
  lastError?: { at: string; message: string } | null
  pending?: string[]
  conflicts?: SyncConflict[]
  lastReport?: {
    at: string
    read?: number
    dbWritten?: number
    sheetWritten?: number
    failed?: number
  }
}

async function call<T>(path: string, token: string, init?: RequestInit) {
  const res = await fetch(path, {
    ...init,
    headers: { authorization: `Bearer ${token}` },
  })
  const body = await res.json().catch(() => null)
  if (!res.ok || !body?.ok) {
    console.error('sync api failed', path, res.status, body)
    throw new Error(`同期の API が失敗しました (${res.status})`)
  }
  return body as T
}

export type SyncStatus = { state: SyncState | null; health: SyncHealth }

export async function fetchSyncState(token: string): Promise<SyncStatus> {
  const body = await call<SyncStatus>('/api/sync/status', token)
  return { state: body.state, health: body.health }
}

export async function runSyncNow(token: string): Promise<void> {
  await call('/api/sync/sheet', token, { method: 'POST' })
}
