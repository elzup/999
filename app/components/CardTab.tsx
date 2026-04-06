import { h } from 'preact'
import { useState, useMemo, useCallback, useEffect, useRef } from 'preact/hooks'
import type { CardEntry } from '../data/schema'
import type { Record as TestRecord } from '../data/schema'
import { SUIT_LABEL } from '../data/constants'
import { loadCardRecords, saveCardRecords } from '../data/storage'
import { formatCardId, pickCardPrompt } from '../data/cards'
import CardDetailPanel from './CardDetailPanel'
import RecordPanel from './RecordPanel'

type Props = {
  cards: CardEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
  onCheckingChange?: (checking: boolean) => void
}

const SUIT_NAME: Record<string, string> = {
  S: 'スペード',
  H: 'ハート',
  C: 'クラブ',
  D: 'ダイヤ',
}

type Mode = 'view' | 'check'

type MatchItem = {
  card: CardEntry
  key: string
  value: string
  label: string
}

type MatchResult = {
  key: string
  correct: boolean
}

function shuffle<T>(arr: readonly T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function suitColor(suit: string): string {
  if (suit === 'H') return '#f87171'
  if (suit === 'C') return '#4ade80'
  if (suit === 'D') return '#60a5fa'
  return '#94a3b8'
}

type CardCellProps = {
  c: CardEntry
  selected: boolean
  onSelect: () => void
}

function CardCell({ c, selected, onSelect }: CardCellProps) {
  const id = formatCardId(c)
  return (
    <div
      class={'card-cell' + (selected ? ' selected' : '')}
      onClick={onSelect}
    >
      <div class={'card-id ' + c.suit}>{id}</div>
    </div>
  )
}

function pickCardValue(c: CardEntry): { value: string; label: string } | null {
  return pickCardPrompt(c)
}

const SUITS = ['S', 'H', 'C', 'D'] as const

function CardTab({ cards, bookmarks, onToggleBm, onCheckingChange }: Props) {
  const [selected, setSelected] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('view')

  // Test state
  const [allItems, setAllItems] = useState<MatchItem[]>([])
  const [checkIdx, setCheckIdx] = useState(0)
  const [results, setResults] = useState<MatchResult[]>([])
  const [startTime, setStartTime] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [finished, setFinished] = useState(false)
  const [records, setRecords] = useState<TestRecord[]>(loadCardRecords)
  const [showRecords, setShowRecords] = useState(false)
  const timerRef = useRef<number | null>(null)

  useEffect(() => {
    if (mode === 'check' && !finished) {
      timerRef.current = window.setInterval(() => {
        setElapsed(startTime ? Math.round((Date.now() - startTime) / 1000) : 0)
      }, 1000)
    }
    return () => {
      if (timerRef.current !== null) {
        clearInterval(timerRef.current)
        timerRef.current = null
      }
    }
  }, [mode, finished, startTime])

  const selectedCard = useMemo(() => {
    if (selected === null) return null
    return cards.find((c) => c.suit + c.rank === selected) || null
  }, [cards, selected])

  const currentItem = useMemo(() => {
    return allItems[checkIdx] ?? null
  }, [allItems, checkIdx])

  const currentOptions = useMemo(() => {
    if (!currentItem) return []
    const distractors = allItems.filter((item) => item.key !== currentItem.key)
    const picked = shuffle(distractors).slice(0, 3)
    return shuffle([currentItem, ...picked])
  }, [allItems, currentItem])

  const startCheck = useCallback(
    () => {
      const items: MatchItem[] = []
      for (const c of cards) {
        const picked = pickCardValue(c)
        if (picked) {
          items.push({
            card: c,
            key: c.suit + c.rank,
            value: picked.value,
            label: picked.label,
          })
        }
      }
      setAllItems(items)
      setCheckIdx(0)
      setResults([])
      setStartTime(Date.now())
      setElapsed(0)
      setFinished(false)
      setMode('check')
      setSelected(null)
      onCheckingChange?.(true)
    },
    [cards, onCheckingChange]
  )

  const endCheck = useCallback(
    (finalResults?: MatchResult[]) => {
      const used = finalResults ?? results
      const elapsedTime = startTime
        ? Math.round((Date.now() - startTime) / 1000)
        : 0
      const correctCount = used.filter((r) => r.correct).length
      const record: TestRecord = {
        date: new Date().toISOString(),
        score: correctCount,
        total: used.length,
        time: elapsedTime,
      }
      const newRecords = [record, ...records].slice(0, 50)
      setRecords(newRecords)
      saveCardRecords(newRecords)
      setMode('view')
      setFinished(true)
      onCheckingChange?.(false)
    },
    [startTime, results, records, onCheckingChange]
  )

  const tapChoice = useCallback(
    (choiceKey: string) => {
      if (!currentItem || finished) return
      const isCorrect = choiceKey === currentItem.key
      const newResults = [
        ...results,
        { key: currentItem.key, correct: isCorrect },
      ]
      setResults(newResults)
      const nextIdx = checkIdx + 1
      if (nextIdx >= allItems.length) {
        endCheck(newResults)
        return
      }
      setCheckIdx(nextIdx)
    },
    [currentItem, finished, results, checkIdx, allItems.length, endCheck]
  )

  const deleteRecord = useCallback(
    (idx: number) => {
      const newRecords = records.filter((_, i) => i !== idx)
      setRecords(newRecords)
      saveCardRecords(newRecords)
    },
    [records]
  )

  const clearRecords = useCallback(() => {
    setRecords([])
    saveCardRecords([])
  }, [])

  const correctCount = results.filter((r) => r.correct).length
  const lastRecord = records.length > 0 ? records[0] : null
  const bestRecord =
    records.length > 0
      ? records.reduce(
          (best, r) => (r.score > best.score ? r : best),
          records[0]
        )
      : null

  if (mode === 'check') {
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
        {/* Header */}
        <div class="pi-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div class="pi-header-title">カード</div>
            <span
              style={{
                fontSize: '13px',
                color: 'var(--accent)',
                fontFamily: 'monospace',
              }}
            >
              {elapsed}秒 {correctCount}/{results.length}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text2)' }}>
              {Math.min(checkIdx + 1, allItems.length)}/{allItems.length}
            </span>
            <button
              class="filter-btn"
              style={{
                fontSize: '12px',
                minWidth: '50px',
                padding: '4px 10px',
                marginLeft: 'auto',
              }}
              onClick={() => endCheck()}
            >
              終了
            </button>
          </div>
        </div>

        {/* Matching area */}
        <div class="content" style={{ flex: 1 }}>
          <div class="cm-quiz-wrap">
            {currentItem ? (
              <>
                <div class="cm-card-prompt">
                  <div class="cm-card-order">
                    {checkIdx + 1} / {allItems.length}
                  </div>
                  <div
                    class={'cm-card-face ' + currentItem.card.suit}
                    style={{ color: suitColor(currentItem.card.suit) }}
                  >
                    {formatCardId(currentItem.card)}
                  </div>
                </div>

                <div class="cm-choice-list">
                  {currentOptions.map((item, idx) => (
                    <button
                      key={'v-' + item.key}
                      class="cm-choice-btn"
                      onClick={() => tapChoice(item.key)}
                    >
                      <span class="cm-choice-index">
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span class="cm-choice-value">{item.value}</span>
                    </button>
                  ))}
                </div>
              </>
            ) : null}
          </div>
        </div>
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
      {/* Header */}
      <div class="pi-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div class="pi-header-title">カード</div>
          {lastRecord ? (
            <div style={{ fontSize: '11px', color: 'var(--text2)' }}>
              前回:
              <span style={{ color: 'var(--accent)' }}>
                {lastRecord.score}/{lastRecord.total}
              </span>
              {bestRecord ? (
                <>
                  {' '}
                  最高:
                  <span style={{ color: 'var(--warn)' }}>
                    {bestRecord.score}/{bestRecord.total}
                  </span>
                </>
              ) : null}
            </div>
          ) : null}
          <div
            style={{
              marginLeft: 'auto',
              display: 'flex',
              gap: '6px',
              alignItems: 'center',
            }}
          >
            {records.length > 0 ? (
              <button
                class="filter-btn"
                style={{
                  fontSize: '11px',
                  minWidth: '40px',
                  padding: '4px 8px',
                }}
                onClick={() => setShowRecords(true)}
              >
                記録
              </button>
            ) : null}
            <button
              class="filter-btn"
              style={{
                fontSize: '12px',
                minWidth: '60px',
                padding: '4px 10px',
              }}
              onClick={() => startCheck()}
            >
              テスト
            </button>
          </div>
        </div>
      </div>

      {/* Detail panel */}
      <div class="sticky-wrap">
        {selectedCard ? (
          <CardDetailPanel
            c={selectedCard}
            bookmarks={bookmarks}
            onToggleBm={onToggleBm}
            onClose={() => setSelected(null)}
          />
        ) : (
          <div class="sticky-empty">カードを選択</div>
        )}
      </div>

      {/* Records overlay */}
      {showRecords ? (
        <RecordPanel
          title="カード"
          records={records}
          onDelete={deleteRecord}
          onClear={clearRecords}
          onClose={() => setShowRecords(false)}
        />
      ) : null}

      {/* Card grid */}
      <div class="content" style={{ flex: 1 }}>
        <div class="card-grid">
          {SUITS.map((s) => (
            <>
              <div class="card-suit-header" key={'h' + s}>
                {SUIT_LABEL[s]} {SUIT_NAME[s]}
              </div>
              {cards
                .filter((c) => c.suit === s)
                .map((c) => {
                  const key = s + c.rank
                  return (
                    <CardCell
                      key={key}
                      c={c}
                      selected={selected === key}
                      onSelect={() =>
                        setSelected(selected === key ? null : key)
                      }
                    />
                  )
                })}
            </>
          ))}
        </div>
      </div>
    </div>
  )
}

export default CardTab
