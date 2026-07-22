import { spawnSync } from 'node:child_process'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const here = dirname(fileURLToPath(import.meta.url))
const cegTool = resolve(here, '..', 'ceg.mjs')
const specsDir = resolve(here, '..', 'specs')

function runCeg(command) {
  return spawnSync('node', [cegTool, command, '--specs', specsDir], {
    encoding: 'utf8',
  })
}

describe('VCSDD coherence graph', () => {
  it('contains no missing dependencies or cycles', () => {
    const result = runCeg('validate')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain('OK: graph is consistent')
  })

  it('contains every design, behavior, and verification node', () => {
    const result = runCeg('graph')

    expect(result.status, `${result.stdout}\n${result.stderr}`).toBe(0)
    expect(result.stdout).toContain('# CEG (13 nodes / 36 edges)')
    expect(result.stdout).toContain('design:tab-registry')
    expect(result.stdout).toContain('spec:ff-practice')
    expect(result.stdout).toContain('spec:representative-console')
    expect(result.stdout).toContain('test:knowledge-tools')
    expect(result.stdout).toContain('review:adversary-r1')
    expect(result.stdout).toContain('review:adversary-r2')
    expect(result.stdout).toContain('review:adversary-r3')
    expect(result.stdout).toContain('review:adversary-r4')
    expect(result.stdout).toContain('review:adversary-r5')
  })
})
