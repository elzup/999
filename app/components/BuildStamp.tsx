// 動いている版。PWA は端末に古い版を持ち続けることがあるので、デプロイした
// コミットと見比べて «反映されていないのか / 端末が古いのか» を見分ける
import { h } from 'preact'

function format(iso: string) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(
    d.getHours()
  )}:${pad(d.getMinutes())}`
}

function BuildStamp() {
  const build = typeof __BUILD__ === 'undefined' ? null : __BUILD__
  if (!build) return null
  return (
    <div class="build-stamp">
      版 <code>{build.sha}</code> ・ {format(build.builtAt)} ビルド
    </div>
  )
}

export default BuildStamp
