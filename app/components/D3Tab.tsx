import { h } from 'preact'
import { useState, useCallback, useMemo } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { DIGIT_COLORS } from '../data/constants'
import NumDetailPanel from './NumDetailPanel'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

// 100 XYZ entries: for each 2-digit prefix XY, a specific Z digit
const D3_LIST = [
  '000', '011', '022', '033', '045', '056', '060', '071', '083', '094',
  '105', '116', '121', '132', '143', '154', '166', '170', '181', '192',
  '204', '215', '226', '230', '242', '253', '264', '275', '280', '291',
  '302', '313', '325', '336', '340', '351', '363', '374', '385', '396',
  '401', '412', '423', '434', '446', '450', '461', '472', '484', '495',
  '506', '510', '522', '533', '544', '555', '560', '571', '582', '593',
  '605', '616', '620', '631', '643', '654', '665', '676', '681', '692',
  '703', '714', '726', '730', '741', '752', '764', '775', '786', '790',
  '802', '813', '824', '835', '840', '851', '862', '873', '885', '896',
  '900', '911', '923', '934', '945', '956', '961', '972', '983', '994',
] as const

type RevealState = Record<string, boolean>
type ViewMode = 'seq' | 'group'

// Group entries by last digit (Z), ordered 0-6
const Z_GROUPS: [string, string[]][] = (() => {
  const map: Record<string, string[]> = {}
  for (const xyz of D3_LIST) {
    const z = xyz[2]
    ;(map[z] ??= []).push(xyz)
  }
  return ['0', '1', '2', '3', '4', '5', '6']
    .filter((z) => map[z])
    .map((z) => [z, map[z]])
})()

// core kana for digits 0-6
const Z_KANA: Record<string, string> = {
  '0': 'ん', '1': 'い', '2': 'に', '3': 'さ', '4': 'し', '5': 'こ', '6': 'ろ',
}

function D3Tab({ numbers, bookmarks, onToggleBm }: Props) {
  const [revealed, setRevealed] = useState<RevealState>({})
  const [selected, setSelected] = useState<string | null>(null)
  const [viewMode, setViewMode] = useState<ViewMode>('seq')

  const numMap = useMemo(() => {
    const m = new Map<string, NumberEntry>()
    for (const n of numbers) {
      m.set(n.num, n)
    }
    return m
  }, [numbers])

  const toggleReveal = useCallback((xyz: string) => {
    setRevealed((prev) => ({ ...prev, [xyz]: !prev[xyz] }))
    setSelected(xyz)
  }, [])

  const revealAll = useCallback(() => {
    const next: RevealState = {}
    for (const xyz of D3_LIST) {
      next[xyz] = true
    }
    setRevealed(next)
  }, [])

  const hideAll = useCallback(() => {
    setRevealed({})
    setSelected(null)
  }, [])

  const selectedPrefixEntry = useMemo(() => {
    if (selected === null) return null
    const prefix = '0' + selected.slice(0, 2)
    return numMap.get(prefix) ?? null
  }, [selected, numMap])

  const renderCell = (xyz: string) => {
    const xy = xyz.slice(0, 2)
    const z = xyz[2]
    const isRevealed = !!revealed[xyz]
    const isSelected = selected === xyz
    return (
      <div
        key={xyz}
        class={
          'd3-cell' +
          (isSelected ? ' selected' : '') +
          (isRevealed ? ' revealed' : '')
        }
        onClick={() => toggleReveal(xyz)}
      >
        <span class="d3-prefix">{xy}</span>
        <span class={'d3-suffix' + (isRevealed ? '' : ' hidden')}>
          {isRevealed ? z : '?'}
        </span>
      </div>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        flex: 1,
        minHeight: 0,
        overflow: 'hidden',
      }}
    >
      <div class="sticky-wrap" style={{ maxHeight: '50vh' }}>
        {selected !== null && selectedPrefixEntry ? (
          <div>
            <div class="d2-detail-header">
              <span class="detail-id">{selected.slice(0, 2)}</span>
              <span style={{ fontSize: '20px', fontWeight: 'bold', fontFamily: 'monospace' }}>
                → {selected[2]}
              </span>
              <button
                class="d2-mode-btn"
                style={{ padding: '4px 10px', flex: 'none', marginLeft: 'auto' }}
                onClick={() => setSelected(null)}
              >
                ×
              </button>
            </div>
            <div class="d2-detail-list">
              <NumDetailPanel
                d={selectedPrefixEntry}
                bookmarks={bookmarks}
                onToggleBm={onToggleBm}
              />
            </div>
          </div>
        ) : (
          <div class="sticky-empty">XY → Z を選択</div>
        )}
      </div>
      <div class="content" style={{ flex: 1, paddingBottom: '4px' }}>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
          <button
            class={'d2-mode-btn' + (viewMode === 'seq' ? ' active' : '')}
            onClick={() => setViewMode('seq')}
          >
            数字順
          </button>
          <button
            class={'d2-mode-btn' + (viewMode === 'group' ? ' active' : '')}
            onClick={() => setViewMode('group')}
          >
            末尾グループ
          </button>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: '4px' }}>
            <button class="d2-mode-btn" onClick={revealAll}>
              全表示
            </button>
            <button class="d2-mode-btn" onClick={hideAll}>
              全隠す
            </button>
          </div>
        </div>
        {viewMode === 'seq' ? (
          <div class="d3-grid">
            {D3_LIST.map((xyz) => renderCell(xyz))}
          </div>
        ) : (
          <div class="d3-groups">
            {Z_GROUPS.map(([z, items]) => {
              const pairs: string[][] = []
              for (let i = 0; i < items.length; i += 2) {
                pairs.push(items.slice(i, i + 2))
              }
              return (
                <div key={z} class="d3-z-section">
                  <div class="d3-z-label">
                    <span style={{ color: DIGIT_COLORS[Number(z)] }}>
                      {z}
                    </span>
                    <span style={{ color: 'var(--text2)', marginLeft: '4px' }}>
                      {Z_KANA[z]}
                    </span>
                    <span style={{ color: 'var(--text2)', marginLeft: '4px', fontSize: '11px' }}>
                      ({items.length})
                    </span>
                  </div>
                  <div class="d3-pairs">
                    {pairs.map((pair, pi) => (
                      <div key={pi} class="d3-pair">
                        {renderCell(pair[0])}
                        {pair[1] ? (
                          <>
                            <div class="d3-pair-sep" />
                            {renderCell(pair[1])}
                          </>
                        ) : null}
                      </div>
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default D3Tab
