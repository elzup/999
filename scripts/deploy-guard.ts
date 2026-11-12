// 手元からデプロイする前の確認。origin/main と同じコミットで、未コミットの変更が無いときだけ通す。
//
// 画面は CI (main に入ったら GitHub Actions) が出す。手元の main が古いまま `nr deploy` すると、
// CI が出した新しい画面や Function を古い版で上書きしてしまう (2026-11-11 に手元の main が
// origin/main から 28 コミット遅れていた)。
// どうしても今の手元の状態で出したいときは DEPLOY_FORCE=1 を付ける。
import { execFileSync } from 'node:child_process'

const git = (...args: string[]) =>
  execFileSync('git', args, { encoding: 'utf8' }).trim()

function fail(lines: string[]): never {
  console.error(
    ['✗ deploy を止めました', ...lines.map((l) => `  ${l}`)].join('\n')
  )
  console.error('  (どうしても今の状態で出すなら DEPLOY_FORCE=1 nr deploy)')
  process.exit(1)
}

function main() {
  if (process.env.DEPLOY_FORCE === '1') {
    console.warn('⚠ DEPLOY_FORCE=1: origin/main との一致を確認せずに出します')
    return
  }

  try {
    git('fetch', '--quiet', 'origin', 'main')
  } catch (err) {
    console.error(err)
    fail(['origin/main を取得できませんでした (ネットワークを確認)'])
  }

  const head = git('rev-parse', 'HEAD')
  const remote = git('rev-parse', 'origin/main')
  if (head !== remote) {
    const [ahead, behind] = git(
      'rev-list',
      '--left-right',
      '--count',
      `HEAD...origin/main`
    )
      .split(/\s+/)
      .map(Number)
    fail([
      `今のコミット ${head.slice(0, 7)} が origin/main ${remote.slice(
        0,
        7
      )} と違います`,
      `(手元だけ ${ahead} コミット / origin だけ ${behind} コミット)`,
      'main を origin/main に揃えてから出してください (git switch main && git pull)',
    ])
  }

  // 未追跡ファイルは対象外 (生成物や作業メモが多い)。追跡しているファイルの変更だけを見る
  const dirty = git('status', '--porcelain', '--untracked-files=no')
  if (dirty) {
    fail(['未コミットの変更があります:', ...dirty.split('\n')])
  }

  console.log(`✓ origin/main (${remote.slice(0, 7)}) と一致。deploy を続けます`)
}

main()
