// numbers/{num} をアプリから読み書きする経路。
// spec: .vsdd/firestore-store/specs/spec-number-api.md
//
// db と書き込み関数を引数で受け取るのは、Firestore に繋がずに
// 「読んだ後に他の面が書いた」状況をテストで作れるようにするため
// (src/firestore/db.js が runTransaction を包んでいるのと同じ理由)。
//
// 書き込みは必ず console-writes 経由にする。ここで文書を組み立てて上書きすると、
// intent の宣言を迂回して rep / ratings を消せてしまう。

export const NUM_PATTERN = /^\d{3}$/

// 1 リクエストは 1 番号の 1 操作なので、これを超える本文は形が違う (REQ-NAPI-005)
export const MAX_BODY_BYTES = 4096

/** writeNumber / console-writes が返す error を HTTP に写す */
function statusForError(error) {
  if (error === 'conflict') return 409
  if (error === 'unknown num') return 404
  return 400
}

function bodyBytes(body) {
  try {
    return Buffer.byteLength(JSON.stringify(body ?? {}), 'utf8')
  } catch {
    // 循環参照など JSON にできない本文。受け付ける形ではない
    return Infinity
  }
}

// 最後に書いた面として 'app' を残す。コンソールと同じ 'console' にすると
// «どの面から入った編集か» が追えなくなる (SOURCES に app がある理由)
const SOURCE = 'app'

async function applyOperation({ body, current, num, now, writes, db }) {
  switch (body?.op) {
    case 'rep':
      return writes.saveRep(db, {
        num,
        picks: body.picks,
        confirmed: Boolean(body.confirmed),
        current,
        now,
        source: SOURCE,
      })
    case 'rating':
      return writes.saveRating(db, {
        num,
        k: body.k,
        w: body.w,
        // 未評価は null。0 (普通) と別状態なので既定値で埋めない (REQ-CON-003)
        v: body.v === undefined ? null : body.v,
        current,
        now,
        source: SOURCE,
      })
    // 語・かなの編集、並べ替え、追加、削除。どれも «slots の最終形» を送る
    case 'slots':
      return writes.saveSlots(db, {
        num,
        slots: body.slots,
        current,
        now,
        source: SOURCE,
      })
    case 'image':
      return writes.confirmImage(db, {
        num,
        slot: body.slot,
        imageUrl: body.imageUrl,
        current,
        now,
        source: SOURCE,
      })
    default:
      return { error: 'unknown op' }
  }
}

/**
 * @param method  'GET' | 'PATCH'
 * @param num     パスから取った番号
 * @param body    PATCH の本文
 * @param db      { readNumber, runTransaction }
 * @param writes  { saveRep, saveRating, confirmImage }
 * @param now     更新時刻 (呼び出し側が決める)
 * @returns { status, payload }
 */
export async function handleNumbersRequest({
  method,
  num,
  body,
  db,
  writes,
  now,
}) {
  if (!NUM_PATTERN.test(String(num ?? ''))) {
    return { status: 400, payload: { ok: false, error: 'invalid_num' } }
  }

  if (method === 'GET') {
    const doc = await db.readNumber(num)
    if (!doc) return { status: 404, payload: { ok: false, error: 'not_found' } }
    return { status: 200, payload: { ok: true, number: doc } }
  }

  if (method !== 'PATCH') {
    return { status: 405, payload: { ok: false, error: 'method_not_allowed' } }
  }

  if (bodyBytes(body) > MAX_BODY_BYTES) {
    return { status: 413, payload: { ok: false, error: 'body_too_large' } }
  }

  const current = await db.readNumber(num)
  if (!current) {
    return { status: 404, payload: { ok: false, error: 'not_found' } }
  }

  // 画面が読んだ時点から動いていれば、その画面の操作は古い前提に立っている。
  // writeNumber も同じ検査をするが、こちらは操作を組み立てる前に落とす
  if (body?.expectedUpdatedAt !== undefined) {
    const actual = current.updatedAt ?? null
    if (actual !== body.expectedUpdatedAt) {
      return {
        status: 409,
        payload: {
          ok: false,
          error: 'conflict',
          expected: body.expectedUpdatedAt,
          actual,
        },
      }
    }
  }

  const result = await applyOperation({ body, current, num, now, writes, db })

  if (result?.error) {
    return {
      status: statusForError(result.error),
      payload: { ok: false, error: result.error },
    }
  }

  return { status: 200, payload: { ok: true, number: result.doc } }
}
