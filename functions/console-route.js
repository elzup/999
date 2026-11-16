// web 版の画像コンソール (hosting の /console/) の経路 (D-0073)。
//   GET  /console/state                 焼き込んだ state に web の印を重ねて返す
//   POST /console/keep {id,slot,on}     ロックの印
//   POST /console/redo {id,slot,on}     撮り直しの印 (撮り直し自体は Mac が起きたときに流す)
//
// state は nr deploy のときに手元の buildState() を functions/private/console-state.json に
// 焼いたもの (語を含むので認証の後ろでだけ返す)。Function からは手元の JSON に書けないので、
// 印は Firestore の imageMarks に置き、手元へは nr images:pull-marks で取り込む。
//
// db は { listMarks, setMark }、marks は src/images/marks.js ({ overlayMarks, markDoc }) を
// 引数で受け取る。Firestore にも生成物の functions/lib にも頼らずにテストできるようにするため。

const INVALID_TARGET = 'id/slot が不正です。画面を再読み込みしてください'
const LOCKED = 'ロック中の枠です。取り直すならロックを外してから'

/** 焼いた targets にある枠だけ受け付ける。タグ違いで分けた枠 (w1_2#res) は t.slots に載る */
function isValidTarget(state, { id, slot }) {
  if (typeof id !== 'string' || typeof slot !== 'string') return false
  const target = state.targets.find((t) => t.id === id)
  if (!target) return false
  const slots = target.slots ?? state.kinds[target.kind]?.slots ?? []
  return slots.includes(slot)
}

async function currentMarks(state, db, marks) {
  return marks.overlayMarks(
    { keep: state.keep ?? {}, redo: state.redo ?? {} },
    await db.listMarks()
  )
}

/**
 * @returns {Promise<{status: number, payload: object} | null>} 担当外の経路なら null
 */
export async function handleConsoleRequest({
  method,
  path,
  body,
  state,
  db,
  marks,
  now,
}) {
  if (path === '/console/state' && method === 'GET') {
    const current = await currentMarks(state, db, marks)
    return { status: 200, payload: { ...state, ...current } }
  }

  const op = { '/console/keep': 'keep', '/console/redo': 'redo' }[path]
  if (!op) return null
  if (method !== 'POST') return { status: 405, payload: { error: 'POST だけ' } }
  if (!isValidTarget(state, body ?? {}))
    return { status: 400, payload: { error: INVALID_TARGET } }

  const { id, slot } = body
  const on = Boolean(body.on)
  const before = await currentMarks(state, db, marks)
  // ロック中の枠に撮り直しの印を付けると、次の一括で上書きされる (手元の server.js と同じ)
  if (op === 'redo' && on && before.keep[`${id}:${slot}`])
    return { status: 409, payload: { error: LOCKED } }

  const mark = marks.markDoc({ id, slot, op, on, reason: body.reason, now })
  await db.setMark(mark)
  const after = marks.overlayMarks(before, [mark])
  return { status: 200, payload: { [op]: after[op] } }
}
