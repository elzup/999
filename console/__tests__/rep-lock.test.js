import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  acquireLock,
  isHolderAlive,
  readLock,
  releaseLock,
} from '../rep-lock.js'

function lockPathIn() {
  return join(mkdtempSync(join(tmpdir(), 'rep-lock-')), 'rep-server.lock')
}

const alive = () => true
const dead = () => false

describe('representative console single-instance lock', () => {
  it('REQ-REP-008: grants the first start and records where it listens', () => {
    const lockPath = lockPathIn()

    const result = acquireLock({ lockPath, pid: 111, port: 6001 })

    expect(result.ok).toBe(true)
    expect(readLock(lockPath)).toEqual({
      pid: 111,
      port: 6001,
      url: 'http://127.0.0.1:6001',
    })
  })

  it('REQ-REP-008: refuses a second start even on a different port', () => {
    const lockPath = lockPathIn()
    acquireLock({ lockPath, pid: 111, port: 6001 })

    const result = acquireLock({
      lockPath,
      pid: 222,
      port: 6008,
      isAlive: alive,
    })

    expect(result.ok).toBe(false)
    expect(result.holder.pid).toBe(111)
  })

  it('REQ-REP-008: leaves the running holder untouched when it refuses', () => {
    const lockPath = lockPathIn()
    acquireLock({ lockPath, pid: 111, port: 6001 })

    acquireLock({ lockPath, pid: 222, port: 6008, isAlive: alive })

    expect(readLock(lockPath).pid).toBe(111)
  })

  it('REQ-REP-008: takes over a lock whose holder is gone', () => {
    const lockPath = lockPathIn()
    acquireLock({ lockPath, pid: 111, port: 6001 })

    const result = acquireLock({
      lockPath,
      pid: 222,
      port: 6001,
      isAlive: dead,
    })

    expect(result.ok).toBe(true)
    expect(readLock(lockPath).pid).toBe(222)
  })

  it('REQ-REP-008: treats an unreadable lock file as stale', () => {
    const lockPath = lockPathIn()
    writeFileSync(lockPath, 'not json')

    const result = acquireLock({ lockPath, pid: 222, port: 6001 })

    expect(result.ok).toBe(true)
    expect(readLock(lockPath).pid).toBe(222)
  })

  it('REQ-REP-008: releases only its own lock', () => {
    const lockPath = lockPathIn()
    acquireLock({ lockPath, pid: 111, port: 6001 })

    expect(releaseLock({ lockPath, pid: 222 })).toBe(false)
    expect(readLock(lockPath).pid).toBe(111)

    expect(releaseLock({ lockPath, pid: 111 })).toBe(true)
    expect(readLock(lockPath)).toBe(null)
  })

  it('REQ-REP-008: allows a restart once the lock is released', () => {
    const lockPath = lockPathIn()
    acquireLock({ lockPath, pid: 111, port: 6001 })
    releaseLock({ lockPath, pid: 111 })

    expect(acquireLock({ lockPath, pid: 222, port: 6001 }).ok).toBe(true)
  })

  it('REQ-REP-008: rejects a recycled pid that is not a rep-server', () => {
    expect(isHolderAlive(111, () => '/usr/bin/some-other-daemon')).toBe(false)
    expect(isHolderAlive(111, () => 'node console/rep-server.js')).toBe(true)
  })

  it('REQ-REP-008: treats a missing or invalid pid as not alive', () => {
    expect(isHolderAlive(undefined)).toBe(false)
    expect(isHolderAlive(0)).toBe(false)
    expect(isHolderAlive(-1)).toBe(false)
  })
})
