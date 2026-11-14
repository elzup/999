// 番号 1 件の読み書き。spec: .vsdd/firestore-store/specs/spec-number-api.md
//
// 配信データ (appDataApi) とは別経路。あちらはビルド時に焼き込んだ全件で、
// こちらは Firestore の現在値を 1 件ずつ見る。編集はこちらだけを通す。

export type RepPick = { k: string; w: string }
export type Rating = { k: string; w: string; v: number }

export type NumberSlot = {
  word: string
  kana: string
  imageUrl?: string
  /** 画像を確定した時点の語。現在の語とずれたら要再確認 (REQ-CON-005) */
  confirmedFor?: string
  /** タグ違いで分けた語の画像 (出典タグ → URL)。D-0039 */
  tagImages?: Record<string, string>
}

export type NumberDoc = {
  num: string
  slots?: Record<string, NumberSlot>
  rep?: { picks: RepPick[]; confirmed: boolean }
  ratings?: Rating[]
  derived?: {
    ptBySlot?: Record<string, number | null>
    rankeyBySlot?: Record<string, string>
  }
  updatedAt?: string | null
  source?: string
}

export type PatchOp =
  | { op: 'rep'; picks: RepPick[]; confirmed: boolean }
  | { op: 'rating'; k: string; w: string; v: number | null }
  // 語・かなの編集、並べ替え、追加、削除。どれも slots の最終形を送る
  | { op: 'slots'; slots: Record<string, NumberSlot> }
  // tag 付きはタグ違いで分けた語の画像 (D-0039)
  | { op: 'image'; slot: string; tag?: string; imageUrl: string }

/**
 * API の失敗。retryable は «送り直せば通りうる» (圏外・タイムアウト・サーバ側の 5xx)。
 * 保存キューは retryable なら捨てずに積んだまま送り直し、そうでなければ (409 衝突・
 * 4xx の形の誤り) 赤にして読み直す。
 */
export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly retryable: boolean
  ) {
    super(message)
    this.name = 'ApiError'
  }
}

export const isRetryable = (error: unknown) =>
  !(error instanceof ApiError) || error.retryable

// 通信が返ってこないまま止まらないよう、この時間で切って «送り直す» 側に倒す
const TIMEOUT_MS = 15_000

async function request(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } catch {
    throw new ApiError('通信できません (圏外・タイムアウト)', 0, true)
  } finally {
    clearTimeout(timer)
  }
}

async function readJson(res: Response) {
  return res.json().catch(() => null)
}

/**
 * この API は Functions が返す。JSON ですらない応答が来たら、届く前で
 * 落ちている。dev では vite の proxy 先 (functions emulator) が起動して
 * いない場合がこれで、素の 500 が返る。理由が分からないまま «保存できない»
 * と見えるのが一番困るので、次にやることまで書く。
 */
function transportError(res: Response, fallback: string) {
  if (res.status >= 500) {
    return new ApiError(
      `API に届いていません (${res.status})。ローカルなら nr dev:api を起動`,
      res.status,
      true
    )
  }
  return new ApiError(`${fallback} (${res.status})`, res.status, false)
}

/** JSON で返ってきた失敗。5xx は送り直す側、4xx (409 含む) は送り直しても同じ */
function apiError(res: Response, message: string) {
  return new ApiError(message, res.status, res.status >= 500)
}

export async function fetchNumber(
  num: string,
  token: string
): Promise<NumberDoc> {
  const res = await request(`/api/numbers/${num}`, {
    headers: { authorization: `Bearer ${token}` },
  })

  const data = await readJson(res)
  if (!res.ok || !data?.ok) {
    if (!data) throw transportError(res, '取得に失敗しました')
    throw apiError(res, data.error || `取得に失敗しました (${res.status})`)
  }
  return data.number
}

/**
 * 1 操作だけ送る。expectedUpdatedAt を必ず添えるのは、画面が読んだ後に
 * コンソールや同期が書いていた場合に黙って上書きしないため (REQ-NAPI-006)。
 */
export async function patchNumber({
  num,
  token,
  op,
  expectedUpdatedAt,
}: {
  num: string
  token: string
  op: PatchOp
  expectedUpdatedAt: string | null
}): Promise<NumberDoc> {
  const res = await request(`/api/numbers/${num}`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ ...op, expectedUpdatedAt }),
  })

  const data = await readJson(res)
  if (!res.ok || !data?.ok) {
    if (data?.error === 'conflict') {
      throw new ApiError(
        '他の画面が先に保存しました。読み直してください',
        409,
        false
      )
    }
    if (!data) throw transportError(res, '保存に失敗しました')
    throw apiError(res, data.error || `保存に失敗しました (${res.status})`)
  }
  return data.number
}

/** 百の位 1 つぶん (100 番号) をまとめて読む。代表語ピッカーの一覧用 (REQ-NAPI-008) */
export async function fetchHundred(
  hundred: number,
  token: string
): Promise<NumberDoc[]> {
  const res = await request(`/api/numbers?hundred=${hundred}`, {
    headers: { authorization: `Bearer ${token}` },
  })

  const data = await readJson(res)
  if (!res.ok || !data?.ok) {
    if (!data) throw transportError(res, '取得に失敗しました')
    throw apiError(res, data.error || `取得に失敗しました (${res.status})`)
  }
  return data.numbers
}
