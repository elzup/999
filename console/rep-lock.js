// 代表語コンソールの単一インスタンスロック。
//
// EADDRINUSE はポートが同じ時しか効かない。PORT を変えて背後起動されると相互排他が
// すり抜け、1 プロセス 130MB 級 (実測) が何個も居残って PC のメモリを食う。ここでは
// ポートに依らず「起動を拒否する」だけで、既に動いているサーバは決して落とさない。
// 使用中のコンソールが消えると保存が黙って失敗するため、殺す側には倒さない。

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// checkout ごとに別ロックにする。同じ repo を 2 箇所に clone している場合、それらは
// 別のデータを見る別サーバなので、互いを止めるのは誤り。
const repoRoot = dirname(dirname(fileURLToPath(import.meta.url)))
const lockKey = createHash('sha1').update(repoRoot).digest('hex').slice(0, 8)

export const LOCK_PATH = join(tmpdir(), `rep-server-${lockKey}.lock`)

function readCommand(pid) {
  const result = spawnSync('ps', ['-p', String(pid), '-o', 'command='], {
    encoding: 'utf-8',
  })
  return result.status === 0 ? result.stdout : ''
}

/**
 * ロック保持者がまだ rep-server として生きているか。
 * pid の生存だけでは足りない。tmp のロックは再起動を跨いで残りうるので、無関係な
 * プロセスが同じ pid を再利用していると、生きていないサーバを理由に起動を拒否して
 * しまう。コマンド名まで見て初めて「保持者が生きている」と言える。
 */
export function isHolderAlive(pid, command = readCommand) {
  if (!Number.isInteger(pid) || pid <= 0) return false
  return command(pid).includes('rep-server')
}

export function readLock(lockPath = LOCK_PATH) {
  try {
    return JSON.parse(readFileSync(lockPath, 'utf-8'))
  } catch {
    return null
  }
}

/**
 * 起動権を取る。生きている保持者が居れば `{ok:false, holder}` を返すだけで何もしない。
 * kill -9 や再起動で残った残骸 (stale) は奪う。
 */
export function acquireLock({
  lockPath = LOCK_PATH,
  pid = process.pid,
  port,
  isAlive = isHolderAlive,
} = {}) {
  const payload = JSON.stringify({
    pid,
    port,
    url: `http://127.0.0.1:${port}`,
  })

  // 同時起動の競合は OS の排他生成 (wx) に任せる。read してから write すると隙間で
  // 両方が勝つ。
  const tryCreate = () => {
    try {
      writeFileSync(lockPath, payload, { flag: 'wx' })
      return true
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      return false
    }
  }

  if (tryCreate()) return { ok: true }

  const holder = readLock(lockPath)
  if (holder && isAlive(holder.pid)) return { ok: false, holder }

  try {
    unlinkSync(lockPath)
  } catch {
    // 別プロセスが先に片付けただけ。作り直しを試みればよい
  }
  if (tryCreate()) return { ok: true }
  return { ok: false, holder: readLock(lockPath) }
}

/** 自分が取ったロックだけ外す。他人のロックを消すと相互排他が壊れる。 */
export function releaseLock({ lockPath = LOCK_PATH, pid = process.pid } = {}) {
  if (readLock(lockPath)?.pid !== pid) return false
  try {
    unlinkSync(lockPath)
    return true
  } catch {
    return false
  }
}
