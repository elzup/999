// 端末の «戻る» を «開いている状態を 1 つ閉じる» に割り当てる。
//
// PWA (特に Android のジェスチャーナビ) では、履歴を積んでいない状態で戻ると
// アプリごと閉じる。編集中に閉じられると入力が消えるので、開いた状態は必ず
// 履歴を 1 つ積み、戻るでそこへ帰す。
//
// 状態は入れ子になりうる (番号を選ぶ → 編集を開く) ので、単一のスタックで
// 管理し、popstate では «一番上» だけを閉じる。

type Entry = { id: number; onBack: () => void }

let stack: Entry[] = []
let nextId = 1
let listening = false
// 自前で history.back() を呼んだときに来る popstate を数える。
// これを無視しないと、閉じるボタン 1 回でスタックが 2 つ消える
let selfPops = 0

function ensureListener() {
  if (listening) return
  listening = true
  window.addEventListener('popstate', () => {
    if (selfPops > 0) {
      selfPops -= 1
      return
    }
    const top = stack.pop()
    if (top) top.onBack()
  })
}

/**
 * 戻るで閉じたい状態を積む。
 * @returns 自分で閉じたときに呼ぶ関数。積んだ履歴を巻き戻す
 */
export function pushBack(onBack: () => void): () => void {
  ensureListener()
  const id = nextId++
  stack.push({ id, onBack })
  history.pushState({ back999: id }, '')

  return () => {
    const index = stack.findIndex((entry) => entry.id === id)
    // 既に戻るで消費されている。ここで back() すると 1 つ余計に戻る
    if (index < 0) return
    stack.splice(index, 1)
    selfPops += 1
    history.back()
  }
}

/** テスト用。スタックを空にする */
export function resetBackStack() {
  stack = []
  selfPops = 0
}

/** テスト用。積まれている数 */
export const backStackSize = () => stack.length
