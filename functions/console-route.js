// web 版の画像コンソール (hosting の /console/) の経路 (D-0073)。
//   GET  /console/state                      焼き込んだ対象一覧に、正本 imageSlots の画像・印を重ねて返す
//   POST /console/keep {id,slot,on}          ロックの印
//   POST /console/redo {id,slot,on}          撮り直しの印 (Mac の nr images:redo-flagged がまとめて取り直す)
//   POST /console/redo-now {id,slot}         その場で語から検索して取り直す (段階 5)
//   POST /console/search-custom {id,slot,query}  検索ワードを指定して取り直す
//   POST /console/recrop {id,slot}           今の画像の元画像を上寄せで切り抜き直す
//   POST /console/set-image {id,slot,image}  2 択で «今までの方» に戻す。今の画像か history にある画像だけ
//
// 取り直しの応答は Mac の console/server.js と同じ { ok, image } / { ok: false, error }。
// 画面が同じ処理で受けられるようにするため。
//
// 画像と印の正本は Firestore imageSlots (spec:image-store, D-0084)。Mac の console と同じ文書を直接読み書きする。
// state は nr deploy のときに手元の buildState() を functions/private/console-state.json に
// 焼いたもの。語を含むので認証の後ろでだけ返す。使うのは対象 (targets / kinds) と表示用の名前だけ。
//
// slots は src/images/slot-store.js ({ listSlots, setMark, update })、docs は slot-docs.js
// ({ marksView, applyImage, rejectedUrlsOf, slotDocId })、fetcher は画像の取得 ({ queryOf, bySearch, recrop }) を
// 引数で受け取る。Firestore・GCS・検索サイトにも、生成物の functions/lib にも頼らずにテストできるようにするため。

const INVALID_TARGET = 'id/slot が不正です。画面を再読み込みしてください'
const LOCKED = 'ロック中の枠です。取り直すならロックを外してから'

const MARK_OPS = { '/console/keep': 'keep', '/console/redo': 'redo' }
const IMAGE_PATHS = new Set([
  '/console/redo-now',
  '/console/search-custom',
  '/console/recrop',
  '/console/set-image',
])

function findTarget(state, { id, slot }) {
  if (typeof id !== 'string' || typeof slot !== 'string') return null
  return state.targets.find((t) => t.id === id) ?? null
}

/** 焼いた targets にある枠だけ受け付ける。タグ違いで分けた枠 (w1_2#res) は t.slots に載る */
function isValidTarget(state, body) {
  const target = findTarget(state, body)
  if (!target) return false
  const slots = target.slots ?? state.kinds[target.kind]?.slots ?? []
  return slots.includes(body.slot)
}

const fail = (error) => ({ status: 200, payload: { ok: false, error } })
const errorText = (err) => String(err?.message || err).slice(0, 200)

/** 1 枠の画像を差し替える操作。取得 (時間がかかる) は transaction の外で済ませてから書く */
async function handleImageRequest({
  path,
  body,
  state,
  slots,
  docs,
  fetcher,
  now,
}) {
  const { id, slot } = body
  const key = docs.slotDocId(id, slot)
  const current = (await slots.listSlots({ now }))[key] ?? null
  if (current?.keep) return { status: 409, payload: { error: LOCKED } }

  let image
  let candidate
  if (path === '/console/set-image') {
    const hash = body.image?.hash
    // 画面から来た画像をそのまま書かない。この枠に一度載った画像 (今か history) だけに戻せる
    image = [current?.image, ...(current?.history ?? [])].find(
      (img) => img && hash && img.hash === hash
    )
    if (!image)
      return {
        status: 400,
        payload: { error: 'この枠に載ったことのない画像には戻せない' },
      }
  } else {
    try {
      if (path === '/console/recrop') {
        if (!current?.image?.sourceImageUrl) return fail('元画像URLが無い')
        image = await fetcher.recrop({ image: current.image })
      } else {
        let query
        if (path === '/console/redo-now') {
          const word = findTarget(state, body)?.[slot]
          if (!word) return fail('この枠に語が無い')
          query = await fetcher.queryOf(word)
          candidate = { ...current?.candidate, word, query, status: 'ok' }
        } else {
          query = typeof body.query === 'string' ? body.query.trim() : ''
          if (!query) return fail('検索ワードが空')
        }
        image = await fetcher.bySearch({
          query,
          rejected: docs.rejectedUrlsOf(current),
        })
        if (!image) return fail('見つからない')
      }
    } catch (err) {
      console.error('console', path, key, err)
      return fail(errorText(err))
    }
  }

  const result = await slots.update(id, slot, (doc) =>
    docs.applyImage(doc, { id, slot, image, candidate, now })
  )
  // 取得している間にロックされた
  if (result.error === 'locked')
    return { status: 409, payload: { error: LOCKED } }
  return { status: 200, payload: { ok: true, image: result.doc.image } }
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
  docs,
  fetcher,
  now,
}) {
  if (path === '/console/state' && method === 'GET') {
    const current = docs.marksView(await slots.listSlots({ now }))
    // canFetch: この Function がその場の取り直しを受けられる印。画面はこれを見てボタンを出す
    return {
      status: 200,
      payload: { ...state, ...current, canFetch: Boolean(fetcher) },
    }
  }

  const op = MARK_OPS[path]
  if (!op && !IMAGE_PATHS.has(path)) return null
  if (method !== 'POST') return { status: 405, payload: { error: 'POST だけ' } }
  if (!isValidTarget(state, body ?? {}))
    return { status: 400, payload: { error: INVALID_TARGET } }

  if (!op)
    return handleImageRequest({ path, body, state, slots, docs, fetcher, now })

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
  const current = docs.marksView(await slots.listSlots({ now }))
  return { status: 200, payload: { [op]: current[op] } }
}
