/// <reference types="vite-plugin-pwa/client" />
import { render } from 'preact'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { listenWriteQueue, writeQueue } from './lib/writeQueue'
import './style.css'

// 前回送り切れなかった書き込み (端末に残したキュー) を、どの画面を開いても続きから送る
const queue = writeQueue()

// ---- PWA の更新 ----
// 新しい版を探すのは起動したときだけ (sw.js 約 2 KB を 1 回)。開いている間に
// 裏で探しに行くことはしない。
// 見つかったら、保存待ちを全部送り終えてから入れ替える (送っている最中に再読み込み
// しない。キューは端末にも残すので、閉じても失われない)
let waiting = false
const updateSW = registerSW({
  immediate: true,
  onNeedRefresh() {
    if (waiting) return
    waiting = true
    const apply = () => {
      if (queue.pendingCount() > 0) return false
      void updateSW(true)
      return true
    }
    if (apply()) return
    const stop = listenWriteQueue({
      onChange: () => {
        if (apply()) stop()
      },
    })
  },
})

render(<App />, document.getElementById('app')!)
