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
  | { op: 'image'; slot: string; imageUrl: string }

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
    return new Error(
      `API に届いていません (${res.status})。ローカルなら nr dev:api を起動`
    )
  }
  return new Error(`${fallback} (${res.status})`)
}

export async function fetchNumber(
  num: string,
  token: string
): Promise<NumberDoc> {
  const res = await fetch(`/api/numbers/${num}`, {
    headers: { authorization: `Bearer ${token}` },
  })

  const data = await readJson(res)
  if (!res.ok || !data?.ok) {
    if (!data) throw transportError(res, '取得に失敗しました')
    throw new Error(data.error || `取得に失敗しました (${res.status})`)
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
  const res = await fetch(`/api/numbers/${num}`, {
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
      throw new Error('他の画面が先に保存しました。読み直してください')
    }
    if (!data) throw transportError(res, '保存に失敗しました')
    throw new Error(data.error || `保存に失敗しました (${res.status})`)
  }
  return data.number
}
