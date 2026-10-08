import { h } from 'preact'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import {
  loadSlideSettings,
  saveSlideSettings,
  loadSlideOk,
  saveSlideOk,
  type SlideSettings,
} from '../data/storage'
import {
  ANSWER_DELAY_MIN,
  PROMPT_DELAY_MIN,
  SLIDE_DELAY_MAX,
  SLIDE_DELAY_STEP,
  advance,
  canGoBack,
  currentId,
  goBack,
  initSlide,
  initialPhase,
  phaseDelay,
  type SlideMode,
  type SlidePhase,
  type SlideState,
} from '../lib/slideshow'
import { deckHasBookmarks, type SlideDeck } from '../lib/slideDeck'
import { vibrate } from '../lib/haptics'

type Props = {
  deck: SlideDeck
  bookmarks?: Set<string>
  onToggleBm?: (key: string) => void
  // 渡すとテスト画面 (.test-screen) として全画面で開き、ヘッダーに終了ボタンを出す。
  onQuit?: () => void
}

const MS_PER_SEC = 1000
const formatSec = (ms: number) => `${(ms / MS_PER_SEC).toFixed(1)}秒`

function DelaySlider({
  label,
  value,
  min,
  onChange,
}: {
  label: string
  value: number
  min: number
  onChange: (ms: number) => void
}) {
  return (
    <label class="slide-range">
      <span class="slide-range-label">{label}</span>
      <input
        type="range"
        min={min}
        max={SLIDE_DELAY_MAX}
        step={SLIDE_DELAY_STEP}
        value={value}
        onInput={(e) => onChange(Number(e.currentTarget.value))}
      />
      <span class="slide-range-val">{formatSec(value)}</span>
    </label>
  )
}

function SlidePlayer({ deck, bookmarks, onToggleBm, onQuit }: Props) {
  const [settings, setSettings] = useState<SlideSettings>(loadSlideSettings)
  const [okSet, setOkSet] = useState<Set<string>>(() => loadSlideOk(deck.id))
  const [playing, setPlaying] = useState(false)

  const canBookmark = Boolean(bookmarks && onToggleBm) && deckHasBookmarks(deck)
  const bmOnly = canBookmark && settings.bmOnly

  // 表示対象プール (item id の配列)。★のみ / OK除外 で絞り込む。
  const pool = useMemo(
    () =>
      deck.items
        .filter((item) => !bmOnly || bookmarks?.has(item.bmKey ?? ''))
        .filter((item) => !settings.skipOk || !okSet.has(item.id))
        .map((item) => item.id),
    [deck.items, bmOnly, bookmarks, settings.skipOk, okSet]
  )

  const byId = useMemo(
    () => new Map(deck.items.map((item) => [item.id, item])),
    [deck.items]
  )

  const [state, setState] = useState<SlideState>(() =>
    initSlide(pool, settings.mode)
  )
  const [phase, setPhase] = useState<SlidePhase>(() => initialPhase(settings))

  const curId = currentId(state)
  const cur = curId ? byId.get(curId) ?? null : null

  const persist = useCallback((next: SlideSettings) => {
    setSettings(next)
    saveSlideSettings(next)
  }, [])

  // 1 段進める。問題面なら答えを出し、答え面なら次の 1 枚へ。
  const step = useCallback(() => {
    if (phase === 'prompt') {
      setPhase('answer')
      return
    }
    setState((s) => advance(s, pool, settings.mode))
    setPhase(initialPhase(settings))
  }, [phase, pool, settings])

  const handleBack = useCallback(() => {
    setPlaying(false)
    vibrate()
    setState((s) => goBack(s))
    // 戻るのは見直すためなので、答えを隠し直さない。
    setPhase('answer')
  }, [])

  // プールが変わって現在アイテムが消えた場合などは作り直す。
  const poolKey = pool.join(',')
  const prevPoolKey = useRef(poolKey)
  useEffect(() => {
    if (prevPoolKey.current === poolKey) return
    prevPoolKey.current = poolKey
    if (curId && pool.includes(curId)) return
    setState(initSlide(pool, settings.mode))
    setPhase(initialPhase(settings))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey])

  // 自動送り。playing 中は段階ごとの待ち時間で 1 段ずつ進む。
  const delay = phaseDelay(phase, settings)
  useEffect(() => {
    if (!playing || pool.length === 0) return
    const id = setTimeout(step, delay)
    return () => clearTimeout(id)
  }, [playing, pool.length, state, delay, step])

  const setMode = (mode: SlideMode) => persist({ ...settings, mode })

  const toggleOk = useCallback(() => {
    if (!curId) return
    vibrate()
    setOkSet((prev) => {
      const next = new Set(prev)
      if (next.has(curId)) next.delete(curId)
      else next.add(curId)
      saveSlideOk(deck.id, next)
      return next
    })
  }, [curId, deck.id])

  const bmKey = canBookmark ? cur?.bmKey : undefined
  const isBm = bmKey ? Boolean(bookmarks?.has(bmKey)) : false
  const isOk = curId ? okSet.has(curId) : false
  const isRevealed = phase === 'answer'

  return (
    <div class={'slide-tab' + (onQuit ? ' test-screen' : '')}>
      {onQuit ? (
        <div class="slide-header">
          <span class="slide-title">{deck.title}</span>
          <button class="filter-btn" onClick={onQuit}>
            終了
          </button>
        </div>
      ) : null}
      <div class="slide-settings">
        <div class="slide-seg">
          <button
            class={
              'slide-seg-btn' + (settings.mode === 'order' ? ' active' : '')
            }
            onClick={() => setMode('order')}
          >
            順番
          </button>
          <button
            class={
              'slide-seg-btn' + (settings.mode === 'random' ? ' active' : '')
            }
            onClick={() => setMode('random')}
          >
            ランダム
          </button>
        </div>
        {canBookmark ? (
          <button
            class={'slide-chip-btn' + (settings.bmOnly ? ' active' : '')}
            onClick={() => persist({ ...settings, bmOnly: !settings.bmOnly })}
          >
            ★のみ
          </button>
        ) : null}
        <button
          class={'slide-chip-btn' + (settings.skipOk ? ' active' : '')}
          onClick={() => persist({ ...settings, skipOk: !settings.skipOk })}
        >
          OK除外
        </button>
        <DelaySlider
          label="答えまで"
          value={settings.promptMs}
          min={PROMPT_DELAY_MIN}
          onChange={(promptMs) => persist({ ...settings, promptMs })}
        />
        <DelaySlider
          label="次まで"
          value={settings.answerMs}
          min={ANSWER_DELAY_MIN}
          onChange={(answerMs) => persist({ ...settings, answerMs })}
        />
      </div>

      <div class="slide-stage" onClick={cur ? step : undefined}>
        {cur ? (
          <div class="slide-card">
            <div class="slide-prompt">{cur.prompt}</div>
            {/* 隠している間も場所を確保し、答えが出た瞬間に問題面が動かないようにする */}
            <div class={'slide-answer' + (isRevealed ? '' : ' is-hidden')}>
              {cur.answer}
            </div>
          </div>
        ) : (
          <div class="slide-empty">
            {bmOnly
              ? '★ブックマークがありません'
              : '表示できる項目がありません'}
          </div>
        )}
        <div class="slide-count">
          {pool.length > 0
            ? `${pool.length}件${okSet.size ? ` / OK ${okSet.size}` : ''}`
            : ''}
        </div>
      </div>

      <div class="slide-actions">
        <button
          class="slide-btn"
          disabled={!canGoBack(state)}
          onClick={handleBack}
        >
          ← 戻る
        </button>
        <button
          class={'slide-btn ok' + (isOk ? ' active' : '')}
          disabled={!curId}
          onClick={toggleOk}
        >
          {isOk ? '✓ OK済' : 'OK印'}
        </button>
        {canBookmark ? (
          <button
            class={'slide-btn star' + (isBm ? ' active' : '')}
            disabled={!bmKey}
            onClick={() => {
              if (!bmKey) return
              vibrate()
              onToggleBm?.(bmKey)
            }}
          >
            {isBm ? '★' : '☆'}
          </button>
        ) : null}
        <button
          class={'slide-btn play' + (playing ? ' active' : '')}
          disabled={pool.length === 0}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? '⏸ 停止' : '▶ 再生'}
        </button>
        <button
          class="slide-btn next"
          disabled={pool.length === 0}
          onClick={() => {
            vibrate()
            step()
          }}
        >
          {isRevealed ? '次へ →' : '答え'}
        </button>
      </div>
    </div>
  )
}

export default SlidePlayer
