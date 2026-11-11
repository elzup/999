/// <reference types="vite-plugin-pwa/client" />
import { render } from 'preact'
import { registerSW } from 'virtual:pwa-register'
import { App } from './App'
import { listenWriteQueue, writeQueue } from './lib/writeQueue'
import './style.css'

// 前回送り切れなかった書き込み (端末に残したキュー) を、どの画面を開いても続きから送る
const queue = writeQueue()

// ---- PWA の更新 ----
// 以前は起動したときしか新しい版を探さず、スマホでアプリを戻しただけでは古い版のまま
// だった。見つけると操作の途中でも即リロードしていた。
// - 探す: 起動時・アプリが前面に戻ったとき・開いている間 30 分ごと
// - 入れ替える: 新しい版が見つかったら、保存待ちを全部送り終えてから (キューは端末にも
//   残すので失われないが、送っている最中に切り替えない)
const CHECK_MS = 30 * 60 * 1000
let waiting = false
const updateSW = registerSW({
  immediate: true,
  onRegisteredSW(_url, registration) {
    if (!registration) return
    const check = () => {
      if (navigator.onLine) registration.update().catch(() => {})
    }
    setInterval(check, CHECK_MS)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') check()
    })
  },
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
