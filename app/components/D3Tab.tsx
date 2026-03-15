import { h } from 'preact'
import { useState, useCallback, useMemo } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
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

function D3Tab({ numbers, bookmarks, onToggleBm }: Props) {
  const [revealed, setRevealed] = useState<RevealState>({})
  const [selected, setSelected] = useState<string | null>(null)

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

  const selectedEntry = useMemo(() => {
    if (selected === null) return null
    return numMap.get(selected) ?? null
  }, [selected, numMap])

  // Also get the 2-digit (0XY) entry for the prefix
  const selectedPrefixEntry = useMemo(() => {
    if (selected === null) return null
    const prefix = '0' + selected.slice(0, 2)
    return numMap.get(prefix) ?? null
  }, [selected, numMap])

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
        {selected !== null && (selectedEntry || selectedPrefixEntry) ? (
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
              {selectedPrefixEntry && (
                <NumDetailPanel
                  d={selectedPrefixEntry}
                  bookmarks={bookmarks}
                  onToggleBm={onToggleBm}
                />
              )}
              {selectedEntry && (
                <NumDetailPanel
                  d={selectedEntry}
                  bookmarks={bookmarks}
                  onToggleBm={onToggleBm}
                />
              )}
            </div>
          </div>
        ) : (
          <div class="sticky-empty">XY → Z を選択</div>
        )}
      </div>
      <div class="content" style={{ flex: 1, paddingBottom: '4px' }}>
        <div style={{ display: 'flex', gap: '4px', marginBottom: '8px' }}>
          <button class="d2-mode-btn" onClick={revealAll}>
            全て表示
          </button>
          <button class="d2-mode-btn" onClick={hideAll}>
            全て隠す
          </button>
        </div>
        <div class="d3-grid">
          {D3_LIST.map((xyz) => {
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
          })}
        </div>
      </div>
    </div>
  )
}

export default D3Tab
