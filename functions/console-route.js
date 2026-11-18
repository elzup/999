// web 版の画像コンソール (hosting の /console/) の経路 (D-0073)。
//   GET  /console/state                 焼き込んだ対象一覧に、正本 imageSlots の画像・印を重ねて返す
//   POST /console/keep {id,slot,on}     ロックの印
//   POST /console/redo {id,slot,on}     撮り直しの印 (撮り直し自体は Mac が流す。段階 5 で Function へ)
//
// 画像と印の正本は Firestore imageSlots (spec:image-store, D-0084)。Mac の console と同じ文書を直接読み書きする。
// state は nr deploy のときに手元の buildState() を functions/private/console-state.json に
// 焼いたもの。語を含むので認証の後ろでだけ返す。使うのは対象 (targets / kinds) と表示用の名前だけ。
//
// slots は src/images/slot-store.js ({ listSlots, setMark })、view は slot-docs.js の marksView を
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

/**
 * @returns {Promise<{status: number, payload: object} | null>} 担当外の経路なら null
 */
export async function handleConsoleRequest({
  method,
  path,
  body,
  state,
  slots,
  view,
  now,
}) {
  if (path === '/console/state' && method === 'GET') {
    const current = view(await slots.listSlots({ now }))
    return { status: 200, payload: { ...state, ...current } }
  }

  const op = { '/console/keep': 'keep', '/console/redo': 'redo' }[path]
  if (!op) return null
  if (method !== 'POST') return { status: 405, payload: { error: 'POST だけ' } }
  if (!isValidTarget(state, body ?? {}))
    return { status: 400, payload: { error: INVALID_TARGET } }

  const { id, slot } = body
  const result = await slots.setMark({
    id,
    slot,
    op,
    on: Boolean(body.on),
    reason: body.reason,
    now,
  })
  if (result.error === 'locked')
    return { status: 409, payload: { error: LOCKED } }
  const current = view(await slots.listSlots({ now }))
  return { status: 200, payload: { [op]: current[op] } }
}
