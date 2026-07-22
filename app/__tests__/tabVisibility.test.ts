import { beforeEach, describe, expect, it } from 'vitest'
import { VALID_TABS } from '../data/constants'
import {
  DEFAULT_TAB_VISIBILITY,
  loadTabVisibility,
  saveTabVisibility,
} from '../data/storage'

class MemoryStorage implements Storage {
  private values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

beforeEach(() => {
  globalThis.localStorage = new MemoryStorage()
})

describe('tab visibility storage', () => {
  it('REQ-TAB-001: defines a default for every registered tab', () => {
    expect(Object.keys(DEFAULT_TAB_VISIBILITY).sort()).toEqual(
      [...VALID_TABS].sort()
    )
    expect(DEFAULT_TAB_VISIBILITY.misc).toBe(true)
  })

  it('REQ-TAB-003: merges a partial saved value with current defaults', () => {
    localStorage.setItem(
      'tabVisibility999',
      JSON.stringify({ num: false, hex: true, removed: true })
    )

    expect(loadTabVisibility()).toEqual({
      ...DEFAULT_TAB_VISIBILITY,
      num: false,
      hex: true,
    })
  })

  it('REQ-TAB-003: keeps valid siblings when other saved values are malformed', () => {
    localStorage.setItem('tabVisibility999', '{broken')
    expect(loadTabVisibility()).toEqual(DEFAULT_TAB_VISIBILITY)

    localStorage.setItem(
      'tabVisibility999',
      JSON.stringify({ num: 'false', hex: true, year: 1 })
    )
    expect(loadTabVisibility()).toEqual({
      ...DEFAULT_TAB_VISIBILITY,
      hex: true,
    })
  })

  it('REQ-TAB-004: never restores misc as hidden', () => {
    localStorage.setItem(
      'tabVisibility999',
      JSON.stringify({ misc: false, hex: true })
    )

    expect(loadTabVisibility()).toEqual({
      ...DEFAULT_TAB_VISIBILITY,
      hex: true,
      misc: true,
    })
  })

  it('REQ-TAB-002: persists an immutable visibility update', () => {
    const current = loadTabVisibility()
    const next = { ...current, hex: true }

    saveTabVisibility(next)

    expect(current.hex).toBe(false)
    expect(loadTabVisibility()).toEqual(next)
  })
})
