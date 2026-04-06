import { h } from 'preact'
import { useEffect, useState } from 'preact/hooks'

type StorageEstimate = {
  usage: number | null
  quota: number | null
  keys: { key: string; bytes: number; valueBytes: number }[]
}

const TRACKED_KEYS = [
  'bm999',
  'tab999',
  'pi999',
  'year999',
  'd3-999',
  'card999',
  'weekday999',
] as const

function estimateLocalStorageKey(key: string) {
  const raw = localStorage.getItem(key)
  const keyBytes = new Blob([key]).size
  const valueBytes = raw ? new Blob([raw]).size : 0
  return {
    key,
    bytes: keyBytes + valueBytes,
    valueBytes,
  }
}

function formatBytes(bytes: number | null) {
  if (bytes === null) return '-'
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`
}

function StorageEstimatePanel() {
  const [estimate, setEstimate] = useState<StorageEstimate>({
    usage: null,
    quota: null,
    keys: [],
  })

  useEffect(() => {
    let mounted = true

    const keys = TRACKED_KEYS
      .map((key) => estimateLocalStorageKey(key))
      .filter((item) => item.valueBytes > 0)
      .sort((a, b) => b.bytes - a.bytes)

    const update = async () => {
      let usage: number | null = null
      let quota: number | null = null
      if ('storage' in navigator && typeof navigator.storage?.estimate === 'function') {
        try {
          const result = await navigator.storage.estimate()
          usage = result.usage ?? null
          quota = result.quota ?? null
        } catch {
          usage = null
          quota = null
        }
      }
      if (!mounted) return
      setEstimate({ usage, quota, keys })
    }

    update()
    return () => {
      mounted = false
    }
  }, [])

  const localTotal = estimate.keys.reduce((sum, item) => sum + item.bytes, 0)

  return (
    <div class="storage-panel">
      <div class="storage-card">
        <div class="storage-card-title">PWA ストレージ見積もり</div>
        <div class="storage-summary">
          <div class="storage-summary-item">
            <div class="storage-summary-label">全体 usage</div>
            <div class="storage-summary-value">{formatBytes(estimate.usage)}</div>
          </div>
          <div class="storage-summary-item">
            <div class="storage-summary-label">全体 quota</div>
            <div class="storage-summary-value">{formatBytes(estimate.quota)}</div>
          </div>
          <div class="storage-summary-item">
            <div class="storage-summary-label">localStorage 合計</div>
            <div class="storage-summary-value">{formatBytes(localTotal)}</div>
          </div>
        </div>
        <div class="storage-note">
          `navigator.storage.estimate()` と localStorage 文字列長からの概算です。
        </div>
      </div>

      <div class="storage-card">
        <div class="storage-card-title">キー別見積もり</div>
        {estimate.keys.length === 0 ? (
          <div class="sticky-empty">保存データなし</div>
        ) : (
          <div class="storage-list">
            {estimate.keys.map((item) => (
              <div key={item.key} class="storage-row">
                <span class="storage-key">{item.key}</span>
                <span class="storage-size">{formatBytes(item.bytes)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export default StorageEstimatePanel
