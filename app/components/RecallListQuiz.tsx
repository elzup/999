import { useState, useCallback, useMemo } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { candidatesOf } from '../lib/choice'

type Props = {
  title: string
  entries: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
  onQuit: () => void
}

type Grade = 'o' | 'x'

type Row = { num: string; word: string; kana: string; bmKey: string }

function toRows(entries: NumberEntry[]): Row[] {
  const rows: Row[] = []
  for (const entry of entries) {
    const cand = candidatesOf(entry)[0]
    if (!cand) continue
    rows.push({
      num: entry.num,
      word: cand.word,
      kana: cand.kana,
      bmKey: 'n:' + entry.num,
    })
  }
  return rows
}

/**
 * 縦長の自己採点リスト。番号を見て頭で連想 → タップでめくって答え合わせ →
 * ○(わかった)/×(わからなかった)を付けていく。× は自動でブックマーク(復習リスト入り)。
 * 4択と違い「答えない・自己判断で送るだけ」のリコール練習。
 */
function RecallListQuiz({
  title,
  entries,
  bookmarks,
  onToggleBm,
  onQuit,
}: Props) {
  const rows = useMemo(() => toRows(entries), [entries])
  const [revealed, setRevealed] = useState<Set<string>>(() => new Set())
  const [grades, setGrades] = useState<Record<string, Grade>>({})
  const [onlyUngraded, setOnlyUngraded] = useState(false)

  const reveal = useCallback((num: string) => {
    setRevealed((prev) => {
      if (prev.has(num)) return prev
      const next = new Set(prev)
      next.add(num)
      return next
    })
  }, [])

  const revealAll = useCallback(() => {
    setRevealed(new Set(rows.map((r) => r.num)))
  }, [rows])

  const grade = useCallback(
    (row: Row, g: Grade) => {
      setRevealed((prev) => {
        if (prev.has(row.num)) return prev
        const next = new Set(prev)
        next.add(row.num)
        return next
      })
      setGrades((prev) => ({ ...prev, [row.num]: g }))
      // × (わからなかった) は復習用に自動ブックマーク。○では外さない。
      if (g === 'x' && !bookmarks.has(row.bmKey)) onToggleBm(row.bmKey)
    },
    [bookmarks, onToggleBm]
  )

  const reset = useCallback(() => {
    setRevealed(new Set())
    setGrades({})
  }, [])

  const counts = useMemo(() => {
    let o = 0
    let x = 0
    for (const g of Object.values(grades)) {
      if (g === 'o') o++
      else if (g === 'x') x++
    }
    return { o, x, done: o + x }
  }, [grades])

  const visibleRows = onlyUngraded ? rows.filter((r) => !grades[r.num]) : rows

  return (
    <div class="test-screen recall-list-screen">
      <div class="pi-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div class="pi-header-title">{title}</div>
          <span class="rl-count o">○{counts.o}</span>
          <span class="rl-count x">×{counts.x}</span>
          <span style={{ fontSize: '11px', color: 'var(--text2)' }}>
            {counts.done}/{rows.length}
          </span>
          <button
            class="filter-btn"
            style={{
              fontSize: '12px',
              minWidth: '50px',
              padding: '4px 10px',
              marginLeft: 'auto',
            }}
            onClick={onQuit}
          >
            終了
          </button>
        </div>
        <div class="rl-toolbar">
          <button
            class={'filter-btn' + (onlyUngraded ? ' active' : '')}
            onClick={() => setOnlyUngraded((v) => !v)}
          >
            未回答のみ
          </button>
          <button class="filter-btn" onClick={revealAll}>
            全部めくる
          </button>
          <button class="filter-btn" onClick={reset}>
            リセット
          </button>
        </div>
      </div>

      <div class="content recall-list-content">
        {visibleRows.map((row) => {
          const isRevealed = revealed.has(row.num)
          const g = grades[row.num]
          const isBm = bookmarks.has(row.bmKey)
          return (
            <div
              key={row.num}
              class={'rl-row' + (g ? ' rl-' + g : '')}
              onClick={() => !isRevealed && reveal(row.num)}
            >
              <span class="rl-num">{row.num}</span>
              <span class="rl-word">
                {isRevealed ? (
                  <>
                    {row.word}
                    {row.kana ? <span class="rl-kana">{row.kana}</span> : null}
                  </>
                ) : (
                  <span class="rl-hidden">タップで答え</span>
                )}
              </span>
              <span class="rl-actions">
                {isRevealed ? (
                  <>
                    <button
                      class={'rl-mark-btn o' + (g === 'o' ? ' active' : '')}
                      onClick={(e) => {
                        e.stopPropagation()
                        grade(row, 'o')
                      }}
                    >
                      ○
                    </button>
                    <button
                      class={'rl-mark-btn x' + (g === 'x' ? ' active' : '')}
                      onClick={(e) => {
                        e.stopPropagation()
                        grade(row, 'x')
                      }}
                    >
                      ×
                    </button>
                    <span
                      class={'bm-star ' + (isBm ? 'on' : '')}
                      onClick={(e) => {
                        e.stopPropagation()
                        onToggleBm(row.bmKey)
                      }}
                    >
                      {isBm ? '★' : '☆'}
                    </span>
                  </>
                ) : null}
              </span>
            </div>
          )
        })}
        {visibleRows.length === 0 ? (
          <div class="rl-empty">全部つけ終わりました</div>
        ) : null}
      </div>
    </div>
  )
}

export default RecallListQuiz
