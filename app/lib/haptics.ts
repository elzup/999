// スマホ IME のようなタップ振動。navigator.vibrate 非対応端末 (iOS Safari 等) では無視される。
export function vibrate(ms = 10) {
  if (
    typeof navigator !== 'undefined' &&
    typeof navigator.vibrate === 'function'
  ) {
    navigator.vibrate(ms)
  }
}
