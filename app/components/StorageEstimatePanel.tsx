import { h } from 'preact'
import { useEffect, useState, useCallback, useRef } from 'preact/hooks'

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
  'cardStats999',
  'weekday999',
] as const

const EXPORT_VERSION = 1

type ExportPayload = {
  app: '999'
  version: number
  exportedAt: string
  data: { [key: string]: string }
}

function buildExportPayload(): ExportPayload {
  const data: { [key: string]: string } = {}
  for (const key of TRACKED_KEYS) {
    const raw = localStorage.getItem(key)
    if (raw !== null) data[key] = raw
  }
  return {
    app: '999',
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data,
  }
}

function parseImportPayload(text: string): ExportPayload {
  const parsed = JSON.parse(text)
  if (
    !parsed ||
    parsed.app !== '999' ||
    typeof parsed.version !== 'number' ||
    typeof parsed.data !== 'object' ||
    parsed.data === null
  ) {
    throw new Error('フォーマットが不正です')
  }
  return parsed as ExportPayload
}

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
  const [message, setMessage] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)
  const [tick, setTick] = useState(0)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
  }, [tick])

  const handleExport = useCallback(() => {
    try {
      const payload = buildExportPayload()
      const json = JSON.stringify(payload, null, 2)
      const blob = new Blob([json], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
      const a = document.createElement('a')
      a.href = url
      a.download = `999-backup-${ts}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      const count = Object.keys(payload.data).length
      setMessage({ type: 'ok', text: `エクスポート完了 (${count} キー)` })
    } catch (err) {
      setMessage({ type: 'err', text: `エクスポート失敗: ${String(err)}` })
    }
  }, [])

  const handleImportFile = useCallback((file: File) => {
    const reader = new FileReader()
    reader.onerror = () => setMessage({ type: 'err', text: '読み込み失敗' })
    reader.onload = () => {
      try {
        const payload = parseImportPayload(String(reader.result ?? ''))
        const allowed = new Set<string>(TRACKED_KEYS)
        const entries = Object.entries(payload.data).filter(([k]) => allowed.has(k))
        const ok = window.confirm(
          `${entries.length} 個のキーを現在のデータに上書きします。よろしいですか？`
        )
        if (!ok) return
        for (const [key, value] of entries) {
          localStorage.setItem(key, value)
        }
        setMessage({ type: 'ok', text: `インポート完了 (${entries.length} キー) — リロードで反映` })
        setTick((t) => t + 1)
      } catch (err) {
        setMessage({ type: 'err', text: `インポート失敗: ${String(err)}` })
      }
    }
    reader.readAsText(file)
  }, [])

  const onPickFile = useCallback((e: Event) => {
    const input = e.currentTarget as HTMLInputElement
    const file = input.files?.[0]
    if (file) handleImportFile(file)
    input.value = ''
  }, [handleImportFile])

  const localTotal = estimate.keys.reduce((sum, item) => sum + item.bytes, 0)

  return (
    <div class="storage-panel">
      <div class="storage-card">
        <div class="storage-card-title">バックアップ (エクスポート / インポート)</div>
        <div class="storage-actions">
          <button class="filter-btn" onClick={handleExport}>
            エクスポート (JSON)
          </button>
          <button
            class="filter-btn"
            onClick={() => fileInputRef.current?.click()}
          >
            インポート
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="application/json,.json"
            style={{ display: 'none' }}
            onChange={onPickFile}
          />
        </div>
        {message ? (
          <div
            class="storage-note"
            style={{ color: message.type === 'ok' ? 'var(--accent)' : '#f87171' }}
          >
            {message.text}
          </div>
        ) : (
          <div class="storage-note">
            記録・ブックマーク等を JSON で書き出し / 読み込みできます。別端末への移行に使えます。
          </div>
        )}
      </div>

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
