// `nr console` を起動する前の下ごしらえ。
//   1. 手元の main が origin/main より遅れていて、そのまま進められる (fast-forward・未コミット無し)
//      ときだけ git pull する。進められないときは警告だけ出して起動は続ける
//   2. web 版のコンソールで付けた印 (Firestore の imageMarks) を手元へ取り込む (pull-marks)
//
// 手元が古いと、web で付けた印を読む仕組みごと無く «redo 0» に見える
// (2026-11-16: 59 コミット遅れの main で起動して、web の印 42 件が見えなかった)。
// console は手元の道具なので、どちらが失敗しても起動は止めない。
import { execFileSync, spawnSync } from 'node:child_process'

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

// 取り込んだ印は Firestore から消える。worktree で動かすと、本体ではなく worktree の
// word-images-*.json (git 管理外で共有されない) に入って行方不明になるので、本体でだけ取り込む
const isMainCheckout = () =>
  git('rev-parse', '--absolute-git-dir') ===
  git('rev-parse', '--path-format=absolute', '--git-common-dir')

function pullMarks() {
  if (!isMainCheckout()) {
    warn([
      'worktree なので web の印は取り込みません (本体の 999 で nr console)',
    ])
    return
  }
  // pull の後に別プロセスで動かす。追いついた新しい pull-marks.js を読ませるため
  const r = spawnSync('node', ['src/images/pull-marks.js'], {
    stdio: 'inherit',
  })
  if (r.status !== 0)
    warn([
      'web の印を取り込めませんでした (Firestore の認証を確認)。手元の印だけで起動します',
    ])
}

catchUpMain()
pullMarks()
