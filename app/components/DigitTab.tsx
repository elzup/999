import { h } from 'preact'
import { useState, useCallback, useMemo } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import NumDetailPanel from './NumDetailPanel'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

type D2Mode = 'upper' | 'lower'
type SpecialSel = { type: string; val: string } | null

function d2BmLabel(type: string, val: string): string {
  if (type === 'u') return val + '_'
  if (type === 'l') return '_' + val
  if (type === 'm') return '_' + val + '_'
  if (type === 'd') return '__' + val
  return val
}

function d2BmFilter(
  numbers: NumberEntry[],
  type: string,
  val: string
): NumberEntry[] {
  if (type === 'u') return numbers.filter((d) => d.num.slice(0, 2) === val)
  if (type === 'l') return numbers.filter((d) => d.num.slice(1) === val)
  if (type === 'm') return numbers.filter((d) => d.num[1] === val)
  if (type === 'd') return numbers.filter((d) => d.num[2] === val)
  return []
}

type FavItem = { key: string; type: string; val: string }

function FavList({
  favD2,
  selected,
  specialSel,
  mode,
  onClearSel,
  onSelectFav,
}: {
  favD2: FavItem[]
  selected: string | null
  specialSel: SpecialSel
  mode: D2Mode
  onClearSel: () => void
  onSelectFav: (f: FavItem) => void
}) {
  if (favD2.length === 0) return null

  return (
    <div class="d2-fav-section">
      <div class="d2-fav-label">
        <span style={{ color: 'var(--warn)' }}>★</span> よく使う
      </div>
      <div class="d2-fav-list">
        {favD2.map((f) => {
          const label = d2BmLabel(f.type, f.val)
          const isSpecial = f.type === 'm' || f.type === 'd'
          const isActive = isSpecial
            ? specialSel &&
              specialSel.type === f.type &&
              specialSel.val === f.val
            : selected === f.val &&
              !specialSel &&
              mode === (f.type === 'u' ? 'upper' : 'lower')

          return (
            <span
              key={f.key}
              style={{
                color: isActive ? 'var(--accent)' : 'var(--text)',
                cursor: 'pointer',
                fontFamily: 'monospace',
                fontSize: '13px',
              }}
              onClick={() => {
                if (isActive) {
                  onClearSel()
                  return
                }
                onSelectFav(f)
              }}
            >
              {label}
            </span>
          )
        })}
      </div>
    </div>
  )
}

function DigitTab({ numbers, bookmarks, onToggleBm }: Props) {
  const [mode, setMode] = useState<D2Mode>('upper')
  const [selected, setSelected] = useState<string | null>(null)
  const [specialSel, setSpecialSel] = useState<SpecialSel>(null)

  const detail = useMemo(() => {
    if (specialSel)
      return d2BmFilter(numbers, specialSel.type, specialSel.val)
    if (selected === null) return null
    if (mode === 'upper')
      return numbers.filter((d) => d.num.slice(0, 2) === selected)
    return numbers.filter((d) => d.num.slice(1) === selected)
  }, [numbers, selected, specialSel, mode])

  const detailLabel = useMemo(() => {
    if (specialSel) return d2BmLabel(specialSel.type, specialSel.val)
    if (selected === null) return null
    return mode === 'upper' ? selected + '_' : '_' + selected
  }, [selected, specialSel, mode])

  const filledSet = useMemo(() => {
    const s = new Set<string>()
    for (const d of numbers) {
      if (d.w1 || d.w2) {
        s.add('u:' + d.num.slice(0, 2))
        s.add('l:' + d.num.slice(1))
      }
    }
    return s
  }, [numbers])

  const modeKey = mode === 'upper' ? 'u:' : 'l:'

  const bmKey = useMemo(() => {
    if (specialSel)
      return 'd2:' + specialSel.type + ':' + specialSel.val
    if (selected !== null)
      return 'd2:' + (mode === 'upper' ? 'u:' : 'l:') + selected
    return null
  }, [selected, specialSel, mode])
  const isBm = bmKey !== null && bookmarks.has(bmKey)

  const favD2 = useMemo(() => {
    return [...bookmarks]
      .filter((k) => k.startsWith('d2:'))
      .map((k) => ({ key: k, type: k[3], val: k.slice(5) }))
      .sort(
        (a, b) =>
          a.type.localeCompare(b.type) || a.val.localeCompare(b.val)
      )
  }, [bookmarks])

  const clearSel = useCallback(() => {
    setSelected(null)
    setSpecialSel(null)
  }, [])

  const handleSelectFav = useCallback(
    (f: FavItem) => {
      const isSpecial = f.type === 'm' || f.type === 'd'
      if (isSpecial) {
        setSelected(null)
        setSpecialSel({ type: f.type, val: f.val })
      } else {
        setSpecialSel(null)
        setMode(f.type === 'u' ? 'upper' : 'lower')
        setSelected(f.val)
      }
    },
    []
  )

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
      <div class="sticky-wrap" style={{ maxHeight: '60vh' }}>
        {detail ? (
          <>
            <div class="d2-detail-header">
              <span class="detail-id">{detailLabel}</span>
              <span style={{ fontSize: '11px', color: 'var(--text2)' }}>
                {detail.length}件
              </span>
              <span
                class={'bm-star ' + (isBm ? 'on' : '')}
                style={{ fontSize: '22px' }}
                onClick={() => bmKey && onToggleBm(bmKey)}
              >
                {isBm ? '★' : '☆'}
              </span>
              <button
                class="d2-mode-btn"
                style={{
                  padding: '4px 10px',
                  flex: 'none',
                  marginLeft: 'auto',
                }}
                onClick={clearSel}
              >
                ×
              </button>
            </div>
            <div class="d2-detail-list">
              {detail.map((d) => (
                <NumDetailPanel
                  key={d.num}
                  d={d}
                  bookmarks={bookmarks}
                  onToggleBm={onToggleBm}
                />
              ))}
            </div>
          </>
        ) : (
          <div class="sticky-empty">2桁を選択</div>
        )}
      </div>
      <div class="content" style={{ flex: 1, paddingBottom: '4px' }}>
        <div
          class="d2-mode-switch"
          style={{ padding: '0', marginBottom: '6px' }}
        >
          <button
            class={'d2-mode-btn' + (mode === 'upper' ? ' active' : '')}
            onClick={() => {
              setMode('upper')
              clearSel()
            }}
          >
            上2桁 (XY_)
          </button>
          <button
            class={'d2-mode-btn' + (mode === 'lower' ? ' active' : '')}
            onClick={() => {
              setMode('lower')
              clearSel()
            }}
          >
            下2桁 (_YZ)
          </button>
        </div>
        <FavList
          favD2={favD2}
          selected={selected}
          specialSel={specialSel}
          mode={mode}
          onClearSel={clearSel}
          onSelectFav={handleSelectFav}
        />
        <div class="d2-grid">
          {Array.from({ length: 100 }, (_, i) => {
            const v = String(i).padStart(2, '0')
            const hasFilled = filledSet.has(modeKey + v)
            const label = mode === 'upper' ? v + '_' : '_' + v
            return (
              <div
                key={v}
                class={
                  'd2-cell' +
                  (selected === v && !specialSel ? ' selected' : '') +
                  (hasFilled ? ' has-word' : '')
                }
                onClick={() => {
                  setSpecialSel(null)
                  setSelected(
                    selected === v && !specialSel ? null : v
                  )
                }}
              >
                {label}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default DigitTab
