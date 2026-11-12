// 動いている版。PWA は端末に古い版を持ち続けることがあるので、デプロイした
// コミットと見比べて «反映されていないのか / 端末が古いのか» を見分ける
import { h } from 'preact'
import { timeAgo } from '../lib/format'

function format(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

function BuildStamp() {
  const build = typeof __BUILD__ === 'undefined' ? null : __BUILD__
  if (!build) return null
  const builtAt = new Date(build.builtAt)
  const isValid = !Number.isNaN(builtAt.getTime())
  return (
    <div class="build-stamp">
      版 <code>{build.sha}</code> ・{' '}
      {isValid
        ? `${format(builtAt)} ビルド (${timeAgo(builtAt, new Date())})`
        : build.builtAt}
    </div>
  )
}

export default BuildStamp
