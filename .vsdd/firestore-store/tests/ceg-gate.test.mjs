import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
// ceg.mjs は knowledge-tools と共用する (feature ごとに複製しない)
const cegTool = resolve(here, '..', '..', 'knowledge-tools', 'ceg.mjs')
const specsDir = resolve(here, '..', 'specs')

function runCeg(command) {
  return spawnSync('node', [cegTool, command, '--specs', specsDir], {
    encoding: 'utf8',
  })
}

describe('firestore-store coherence graph', () => {
  it('contains no missing dependencies or cycles', () => {
    const result = runCeg('validate')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain('OK: graph is consistent')
  })

  it('contains every design and behavior node', () => {
    const result = runCeg('graph')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain('# CEG (7 nodes / 9 edges)')
    for (const id of [
      'design:firestore-schema',
      'design:derived-on-write',
      'design:read-bundles',
      'spec:sheet-to-db-sync',
      'spec:rep-migration',
      'spec:app-data-source',
      'spec:console-writes',
    ]) {
      expect(result.stdout).toContain(id)
    }
  })

  it('orders schema before everything that depends on it', () => {
    const result = runCeg('topo')
    const order = result.stdout.trim().split('\n')

    expect(order[0]).toBe('design:firestore-schema')
    // 読み込み用チャンクは派生値の再計算より後でなければ、古い値を焼き込む
    expect(order.indexOf('design:read-bundles')).toBeGreaterThan(
      order.indexOf('design:derived-on-write')
    )
    // アプリの取得経路はチャンクが出来てから差し替える
    expect(order.indexOf('spec:app-data-source')).toBeGreaterThan(
      order.indexOf('design:read-bundles')
    )
  })
})
