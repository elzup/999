import { useEffect } from 'preact/hooks'

// 自動送り中は画面を消さない (消えると読み上げもタイマーも止まる)。
// 非対応端末では何もしない。タブを離れると端末側で外れるので、戻ったら取り直す。
export function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || typeof navigator === 'undefined') return
    const wl = (navigator as Navigator & { wakeLock?: WakeLock }).wakeLock
    if (!wl) return
    let sentinel: WakeLockSentinel | null = null
    let disposed = false
    const acquire = () => {
      if (document.visibilityState !== 'visible') return
      wl.request('screen')
        .then((s) => {
          if (disposed) s.release().catch(() => {})
          else sentinel = s
        })
        .catch(() => {})
    }
    acquire()
    document.addEventListener('visibilitychange', acquire)
    return () => {
      disposed = true
      document.removeEventListener('visibilitychange', acquire)
      sentinel?.release().catch(() => {})
    }
  }, [active])
}
