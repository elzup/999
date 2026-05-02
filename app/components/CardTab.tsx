import { h } from 'preact'
import { useState, useMemo, useCallback, useEffect, useRef } from 'preact/hooks'
import type { CardEntry, CardStats, CardTrainSettings } from '../data/schema'
import type { Record as TestRecord } from '../data/schema'
import { SUIT_LABEL } from '../data/constants'
import {
  loadCardRecords,
  saveCardRecords,
  loadCardStats,
  saveCardStats,
  loadCardTrainSettings,
  saveCardTrainSettings,
} from '../data/storage'
import { formatCardId, pickCardPrompt } from '../data/cards'
import CardDetailPanel from './CardDetailPanel'
import RecordPanel from './RecordPanel'
import ReviewPanel from './ReviewPanel'
import type { ReviewItem } from './ReviewPanel'

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

type Mode = 'view' | 'check' | 'train'

type TrainDirection = CardTrainSettings['direction']

type MatchItem = {
  card: CardEntry
  key: string
  value: string
  label: string
}

type MatchResult = {
  key: string
  correct: boolean
  time: number
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

function groupCards(
  cards: CardEntry[],
  groupSize: CardTrainSettings['groupSize'],
  _direction: TrainDirection
): CardEntry[][] {
  const out: CardEntry[][] = []
  for (let i = 0; i < cards.length; i += groupSize) {
    out.push(cards.slice(i, i + groupSize))
  }
  return out
}

type CardCellProps = {
  c: CardEntry
  selected: boolean
  stat: CardStats[string] | undefined
  onSelect: () => void
}

function CardCell({ c, selected, stat, onSelect }: CardCellProps) {
  const id = formatCardId(c)
  const avgSec =
    stat && stat.attempts > 0
      ? (stat.totalTime / stat.attempts / 1000).toFixed(1)
      : null
  return (
    <div
      class={'card-cell' + (selected ? ' selected' : '')}
      onClick={onSelect}
    >
      <div class={'card-id ' + c.suit}>{id}</div>
      {stat && stat.attempts > 0 ? (
        <div class="card-stat">
          {stat.wrong > 0 ? (
            <span class="card-stat-wrong">×{stat.wrong}</span>
          ) : null}
          {avgSec !== null ? (
            <span class="card-stat-time">{avgSec}s</span>
          ) : null}
        </div>
      ) : null}
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
  const [trainGroups, setTrainGroups] = useState<CardEntry[][]>([])
  const [checkIdx, setCheckIdx] = useState(0)
  const [results, setResults] = useState<MatchResult[]>([])
  const [startTime, setStartTime] = useState<number | null>(null)
  const [elapsed, setElapsed] = useState(0)
  const [finished, setFinished] = useState(false)
  const [records, setRecords] = useState<TestRecord[]>(loadCardRecords)
  const [stats, setStats] = useState<CardStats>(loadCardStats)
  const [showRecords, setShowRecords] = useState(false)
  const [reviewItems, setReviewItems] = useState<ReviewItem[] | null>(null)
  const [reviewMeta, setReviewMeta] = useState({ score: 0, total: 0, time: 0 })
  const [trainSettings, setTrainSettings] =
    useState<CardTrainSettings>(loadCardTrainSettings)
  const [trainGroupIdx, setTrainGroupIdx] = useState(0)
  const [trainStopped, setTrainStopped] = useState(false)
  const timerRef = useRef<number | null>(null)
  const questionStartRef = useRef<number>(0)

  useEffect(() => {
    const running =
      (mode === 'check' && !finished) || (mode === 'train' && !trainStopped)
    if (running) {
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
  }, [mode, finished, startTime, trainStopped])

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
    const picked = shuffle(distractors).slice(0, 5)
    return shuffle([currentItem, ...picked])
  }, [allItems, currentItem])

  const currentTrainGroup = useMemo(() => {
    return trainGroups[trainGroupIdx] ?? null
  }, [trainGroups, trainGroupIdx])

  const trainAtFirst = trainGroupIdx <= 0
  const trainAtLast = trainGroupIdx >= trainGroups.length - 1

  const updateTrainSettings = useCallback(
    (patch: Partial<CardTrainSettings>) => {
      setTrainSettings((prev) => {
        const next = { ...prev, ...patch }
        saveCardTrainSettings(next)
        return next
      })
    },
    []
  )

  const buildTrainGroups = useCallback(() => {
    return groupCards(
      shuffle(cards),
      trainSettings.groupSize,
      trainSettings.direction
    )
  }, [cards, trainSettings.groupSize, trainSettings.direction])

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
      setAllItems(shuffle(items))
      setCheckIdx(0)
      setResults([])
      questionStartRef.current = Date.now()
      setStartTime(Date.now())
      setElapsed(0)
      setFinished(false)
      setMode('check')
      setSelected(null)
      onCheckingChange?.(true)
    },
    [cards, onCheckingChange]
  )

  const startTrain = useCallback(() => {
    const groups = buildTrainGroups()
    if (groups.length === 0) return
    setTrainGroups(groups)
    setTrainGroupIdx(trainSettings.direction === 'right' ? groups.length - 1 : 0)
    setStartTime(Date.now())
    setElapsed(0)
    setTrainStopped(false)
    setMode('train')
    setSelected(null)
    onCheckingChange?.(true)
  }, [buildTrainGroups, trainSettings.direction, onCheckingChange])

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
        mode: 'check',
      }
      const newRecords = [record, ...records].slice(0, 50)
      setRecords(newRecords)
      saveCardRecords(newRecords)

      // Aggregate per-card stats
      const newStats: CardStats = { ...stats }
      for (const r of used) {
        const prev = newStats[r.key] ?? {
          attempts: 0,
          wrong: 0,
          totalTime: 0,
        }
        newStats[r.key] = {
          attempts: prev.attempts + 1,
          wrong: prev.wrong + (r.correct ? 0 : 1),
          totalTime: prev.totalTime + r.time,
        }
      }
      setStats(newStats)
      saveCardStats(newStats)

      // Build review items
      const items: ReviewItem[] = used.map((r) => {
        const card = allItems.find((item) => item.key === r.key)
        return {
          label: card ? formatCardId(card.card) : r.key,
          correct: r.correct,
          rightAnswer: card?.value ?? '',
        }
      })
      setReviewItems(items)
      setReviewMeta({
        score: correctCount,
        total: used.length,
        time: elapsedTime,
      })

      setMode('view')
      setFinished(true)
      onCheckingChange?.(false)
    },
    [startTime, results, records, stats, allItems, onCheckingChange]
  )

  const tapChoice = useCallback(
    (choiceKey: string) => {
      if (!currentItem || finished) return
      const isCorrect = choiceKey === currentItem.key
      const now = Date.now()
      const time = now - questionStartRef.current
      const newResults = [
        ...results,
        { key: currentItem.key, correct: isCorrect, time },
      ]
      setResults(newResults)
      const nextIdx = checkIdx + 1
      if (nextIdx >= allItems.length) {
        endCheck(newResults)
        return
      }
      questionStartRef.current = now
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

  const stopTrain = useCallback(() => {
    setMode('view')
    onCheckingChange?.(false)
  }, [onCheckingChange])

  const stopTrainTimer = useCallback(() => {
    setTrainStopped((prev) => {
      if (prev) return prev
      const elapsedTime = startTime
        ? Math.round((Date.now() - startTime) / 1000)
        : 0
      const total = trainGroups.reduce((sum, g) => sum + g.length, 0)
      const record: TestRecord = {
        date: new Date().toISOString(),
        score: 0,
        total,
        time: elapsedTime,
        mode: 'train',
      }
      const newRecords = [record, ...records].slice(0, 50)
      setRecords(newRecords)
      saveCardRecords(newRecords)
      return true
    })
  }, [startTime, trainGroups, records])

  const flipLeft = useCallback(() => {
    setTrainGroupIdx((idx) => Math.min(trainGroups.length - 1, idx + 1))
  }, [trainGroups.length])

  const flipRight = useCallback(() => {
    setTrainGroupIdx((idx) => Math.max(0, idx - 1))
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

  if (mode === 'train') {
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
        <div class="pi-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div class="pi-header-title">カード連想テスト</div>
            <span
              style={{
                fontSize: '13px',
                color: trainStopped ? 'var(--text2)' : 'var(--accent)',
                fontFamily: 'monospace',
              }}
            >
              {elapsed}秒{trainStopped ? ' (停止)' : ''}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text2)' }}>
              {Math.min(trainGroupIdx + 1, trainGroups.length)}/{trainGroups.length}
            </span>
            <span style={{ fontSize: '11px', color: 'var(--text2)' }}>
              {trainSettings.groupSize}枚 /{' '}
              {trainSettings.direction === 'right' ? '右から開始' : '左から開始'}
            </span>
            <button
              class="filter-btn"
              style={{
                fontSize: '12px',
                minWidth: '60px',
                padding: '4px 10px',
                marginLeft: 'auto',
              }}
              onClick={() => stopTrain()}
            >
              終了
            </button>
          </div>
        </div>

        <div class="content" style={{ flex: 1 }}>
          <div class="cm-train-wrap">
            <div class="cm-train-head">
              <div class="cm-train-order">
                グループ {trainGroupIdx + 1} / {trainGroups.length}
              </div>
              <div class="cm-train-note">
                連想できたら矢印で進む。最後まで行ったら停止。
              </div>
            </div>

            <div
              class="cm-train-grid"
              style={{
                gridTemplateColumns: `repeat(${currentTrainGroup?.length ?? trainSettings.groupSize}, minmax(0, 1fr))`,
              }}
            >
              {currentTrainGroup?.map((card) => (
                <div
                  key={card.suit + card.rank}
                  class={'cm-train-card ' + card.suit}
                  style={{ color: suitColor(card.suit) }}
                >
                  {formatCardId(card)}
                </div>
              ))}
            </div>

            <div class="cm-train-nav">
              <button
                class="cm-train-arrow"
                disabled={trainAtLast}
                onClick={flipLeft}
                aria-label="左にめくる"
              >
                ←
              </button>
              <button
                class="cm-train-stop"
                disabled={trainStopped}
                onClick={stopTrainTimer}
              >
                {trainStopped ? '停止済' : '⏱ 停止'}
              </button>
              <button
                class="cm-train-arrow"
                disabled={trainAtFirst}
                onClick={flipRight}
                aria-label="右にめくる"
              >
                →
              </button>
            </div>
          </div>
        </div>
      </div>
    )
  }

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
          <div class="cm-quiz-wrap cm-quiz-split">
            {currentItem ? (
              <>
                <div class="cm-card-prompt cm-card-prompt-side">
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

                <div class="cm-choice-list cm-choice-list-side">
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
              flexWrap: 'wrap',
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
              onClick={() => startTrain()}
            >
                連想テスト
            </button>
            <button
              class="filter-btn"
              style={{
                fontSize: '12px',
                minWidth: '60px',
                padding: '4px 10px',
              }}
              onClick={() => startCheck()}
            >
                選択テスト
            </button>
          </div>
        </div>
      </div>

      <div class="card-train-settings">
        <div class="card-train-settings-row">
          <span class="card-train-settings-label">枚数</span>
          <div class="card-train-settings-btns">
            {[2, 3, 4].map((size) => (
              <button
                key={size}
                class={
                  'd2-mode-btn' +
                  (trainSettings.groupSize === size ? ' active' : '')
                }
                onClick={() =>
                  updateTrainSettings({
                    groupSize: size as CardTrainSettings['groupSize'],
                  })
                }
              >
                {size}枚
              </button>
            ))}
          </div>
        </div>
        <div class="card-train-settings-row">
          <span class="card-train-settings-label">送り</span>
          <div class="card-train-settings-btns">
            <button
              class={
                'd2-mode-btn' +
                (trainSettings.direction === 'right' ? ' active' : '')
              }
              onClick={() => updateTrainSettings({ direction: 'right' })}
            >
              右から
            </button>
            <button
              class={
                'd2-mode-btn' +
                (trainSettings.direction === 'left' ? ' active' : '')
              }
              onClick={() => updateTrainSettings({ direction: 'left' })}
            >
              左から
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

      {/* Review overlay */}
      {reviewItems ? (
        <ReviewPanel
          title="カード"
          score={reviewMeta.score}
          total={reviewMeta.total}
          time={reviewMeta.time}
          items={reviewItems}
          onClose={() => setReviewItems(null)}
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
                      stat={stats[key]}
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
