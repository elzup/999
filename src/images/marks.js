// web 版の画像コンソールが付けた «ロック / 撮り直し» の印 (D-0073)。
// Mac が落ちていても印だけは付けられるよう、Firestore の imageMarks に貯める。
// 印の正本は手元の word-images-keep.json / word-images-redo.json のまま。
// web の印はその上に重ねる差分で、Mac で nr images:pull-marks を流すと手元へ取り込まれて消える。
//
// 文書 (imageMarks/{id}:{slot}) の形:
//   { id, slot, at, keep?: boolean, redo?: { flaggedAt, reason } | false }
// keep / redo は «持っていればその値で上書き»。持っていない欄は手元の値のまま。
// false を «欄が無い» と分けるのは、web で外した印も手元へ伝えるため。

export const MARKS_COLLECTION = 'imageMarks'

export const markKey = (id, slot) => `${id}:${slot}`

/**
 * 手元の keep / redo に web の印を重ねる。入力は書き換えない。
 * @param {{keep: Record<string, true>, redo: Record<string, object>}} base
 * @param {{id: string, slot: string, keep?: boolean, redo?: object|false}[]} marks
 */
export function overlayMarks(base, marks) {
  let keep = { ...base.keep }
  let redo = { ...base.redo }
  for (const mark of marks) {
    const key = markKey(mark.id, mark.slot)
    if (typeof mark.keep === 'boolean') {
      const { [key]: _dropped, ...rest } = keep
      keep = mark.keep ? { ...rest, [key]: true } : rest
    }
    if (mark.redo !== undefined) {
      const { [key]: _dropped, ...rest } = redo
      redo = mark.redo ? { ...rest, [key]: mark.redo } : rest
    }
  }
  return { keep, redo }
}

/** 印 1 件ぶんの Firestore 文書 (set の merge で書く) */
export function markDoc({ id, slot, op, on, reason, now }) {
  if (op === 'keep') return { id, slot, at: now, keep: Boolean(on) }
  const redo = on ? { flaggedAt: now, reason: reason || '' } : false
  return { id, slot, at: now, redo }
}
