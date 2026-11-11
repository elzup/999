// 編集画面の保存キュー (NumberOpQueue) をアプリで 1 つだけ持つ。
//
// 画面ごとに作ると、編集を閉じて開き直すたびに «読んだ文書» と «保存待ち» が消え、
// 開くたびに読み込みを待つことになる (待機を作らない UI の原則に反する)。
// 1 つにしておけば、一度読んだ番号・先読みした百の位はすぐ出せる。
import { fetchNumber, patchNumber } from './numberApi'
import { loadEditorToken } from './editorAuth'
import { NumberOpQueue } from './opQueue'

type Listener = {
  onChange: () => void
  onSettled: (num: string, message?: string) => void
  onError: (num: string, message: string) => void
}

const listeners = new Set<Listener>()
let shared: NumberOpQueue | null = null

export function editorQueue(): NumberOpQueue {
  if (!shared) {
    shared = new NumberOpQueue({
      send: (num, op, expectedUpdatedAt) =>
        patchNumber({ num, token: loadEditorToken(), op, expectedUpdatedAt }),
      reload: (num) => fetchNumber(num, loadEditorToken()),
      onChange: () => listeners.forEach((l) => l.onChange()),
      onSettled: (num, message) =>
        listeners.forEach((l) => l.onSettled(num, message)),
      onError: (num, message) =>
        listeners.forEach((l) => l.onError(num, message)),
    })
  }
  return shared
}

/** 開いている編集画面が変化を受け取る。戻り値で解除 */
export function listenEditorQueue(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
