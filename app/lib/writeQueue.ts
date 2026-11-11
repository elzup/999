// 番号への書き込みキュー (NumberOpQueue) をアプリで 1 本だけ持つ。
//
// 代表タブと編集画面で別々に持つと、同じ番号を両方から書いたときに前提の時刻が
// ずれて衝突する。閉じて開き直すと «読んだ文書» と «保存待ち» が消える。
// 1 本にして端末 (localStorage) にも書いておけば、どの画面からでも続きから送れる。
import { fetchNumber, patchNumber } from './numberApi'
import { loadEditorToken } from './editorAuth'
import { NumberOpQueue } from './opQueue'

const STORAGE_KEY = 'writeQueue999'

type Listener = {
  onChange?: () => void
  onSettled?: (num: string, message?: string) => void
  onError?: (num: string, message: string) => void
}

const listeners = new Set<Listener>()
let shared: NumberOpQueue | null = null

export function writeQueue(): NumberOpQueue {
  if (!shared) {
    shared = new NumberOpQueue({
      send: (num, op, expectedUpdatedAt) =>
        patchNumber({ num, token: loadEditorToken(), op, expectedUpdatedAt }),
      read: (num) => fetchNumber(num, loadEditorToken()),
      onChange: () => listeners.forEach((l) => l.onChange?.()),
      onSettled: (num, message) =>
        listeners.forEach((l) => l.onSettled?.(num, message)),
      onError: (num, message) =>
        listeners.forEach((l) => l.onError?.(num, message)),
      storage: {
        load: () => localStorage.getItem(STORAGE_KEY),
        save: (text) => localStorage.setItem(STORAGE_KEY, text),
      },
    })
  }
  return shared
}

/** キューの変化を受け取る。戻り値で解除 */
export function listenWriteQueue(listener: Listener): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
