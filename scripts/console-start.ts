// `nr console` を起動する前の下ごしらえ。
//   1. 手元の main が origin/main より遅れていて、そのまま進められる (fast-forward・未コミット無し)
//      ときだけ git pull する。進められないときは警告だけ出して起動は続ける
//
// 手元が古いと、新しい仕組み (画像の正本との同期など) ごと無いまま起動してしまう
// (2026-11-16: 59 コミット遅れの main で起動して、web の印 42 件が見えなかった)。
// web で付けた印は正本 (Firestore imageSlots) に入り、console/server.js が起動時に取り込む。
// console は手元の道具なので、失敗しても起動は止めない。
import { execFileSync } from 'node:child_process'

const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8' }).trim()

const warn = (lines: string[]) =>
  console.warn(
    ['⚠ console 起動前の確認', ...lines.map((l) => `  ${l}`)].join('\n')
  )

function countAheadBehind(): [number, number] {
  const [ahead, behind] = git(
    'rev-list',
    '--left-right',
    '--count',
    'HEAD...origin/main'
  )
    .split(/\s+/)
    .map(Number)
  return [ahead, behind]
}

function catchUpMain() {
  try {
    git('fetch', '--quiet', 'origin', 'main')
  } catch (err) {
    console.error(err)
    warn(['origin/main を取得できませんでした。手元のまま起動します'])
    return
  }
  const [ahead, behind] = countAheadBehind()
  if (behind === 0) return

  const branch = git('rev-parse', '--abbrev-ref', 'HEAD')
  // 未追跡は対象外 (作業メモや生成物が多い)。追跡ファイルの変更があると pull が止まる/混ざる
  const dirty = git('status', '--porcelain', '--untracked-files=no')
  if (branch !== 'main' || ahead > 0 || dirty) {
    warn(
      [
        `origin/main より ${behind} コミット遅れていますが、自動では追いつけません`,
        branch !== 'main' ? `今のブランチが main ではない (${branch})` : '',
        ahead > 0 ? `手元だけのコミットが ${ahead} 個ある` : '',
        dirty ? '未コミットの変更がある (退避してから git pull --ff-only)' : '',
        '古い console のまま起動します',
      ].filter(Boolean)
    )
    return
  }
  const before = git('rev-parse', 'HEAD')
  git('pull', '--ff-only', '--quiet', 'origin', 'main')
  console.log(`✓ origin/main に追いつきました (${behind} コミット)`)
  const changed = git('diff', '--name-only', before, 'HEAD').split('\n')
  if (
    changed.some((f) =>
      /(^|\/)(package\.json|pnpm-lock\.yaml|package-lock\.json)$/.test(f)
    )
  )
    warn(['依存が変わりました。console が落ちたら ni してから nr console'])
}

catchUpMain()
