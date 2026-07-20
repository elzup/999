import { h } from 'preact'
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import {
  loadSlideSettings,
  saveSlideSettings,
  loadSlideOk,
  saveSlideOk,
  type SlideSettings,
} from '../data/storage'
import {
  SLIDE_SPEEDS,
  SLIDE_SPEED_LABELS,
  advance,
  canGoBack,
  currentId,
  goBack,
  initSlide,
  type SlideMode,
  type SlideState,
} from '../lib/slideshow'
import { vibrate } from '../lib/haptics'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

function hasWord(d: NumberEntry): boolean {
  return Boolean(d.wh1 || d.w1 || d.wm1 || d.w2)
}

function SlideCard({ d }: { d: NumberEntry }) {
  const img1 = d.wh1Img || d.w1Img
  const word1 = d.wh1 || d.w1
  const kana1 = d.wh1k || d.w1k
  const img2 = d.wm1Img || d.w2Img
  const word2 = d.wm1 || d.w2
  const kana2 = d.wm1k || d.w2k

  return (
    <div class="slide-card">
      <div class="slide-num">{d.num}</div>
      <div class="slide-words">
        {word1 ? (
          <div class="slide-word-row">
            {img1 ? (
              <img
                class="slide-word-img"
                loading="lazy"
                src={img1}
                alt={word1}
              />
            ) : null}
            <div class="slide-word-text">
              <span class="slide-word-main">{word1}</span>
              {kana1 ? <span class="slide-word-kana">{kana1}</span> : null}
            </div>
          </div>
        ) : null}
        {word2 ? (
          <div class="slide-word-row sub">
            {img2 ? (
              <img
                class="slide-word-img"
                loading="lazy"
                src={img2}
                alt={word2}
              />
            ) : null}
            <div class="slide-word-text">
              <span class="slide-word-main">{word2}</span>
              {kana2 ? <span class="slide-word-kana">{kana2}</span> : null}
            </div>
          </div>
        ) : null}
      </div>
      <div class="slide-tags">
        {d.hito ? (
          <div class="detail-chip">
            <span class="dc-label">人</span>
            <span class="dc-val">{d.hito}</span>
          </div>
        ) : null}
        {d.mono ? (
          <div class="detail-chip">
            <span class="dc-label">物</span>
            <span class="dc-val">{d.mono}</span>
          </div>
        ) : null}
        {d.gainen ? (
          <div class="detail-chip">
            <span class="dc-label">念</span>
            <span class="dc-val">{d.gainen}</span>
          </div>
        ) : null}
      </div>
    </div>
  )
}

function SlideshowTab({ numbers, bookmarks, onToggleBm }: Props) {
  const [settings, setSettings] = useState<SlideSettings>(loadSlideSettings)
  const [okSet, setOkSet] = useState<Set<string>>(loadSlideOk)
  const [playing, setPlaying] = useState(false)

  const withWords = useMemo(() => numbers.filter(hasWord), [numbers])

  // 表示対象プール (id=num の配列)。★のみ / OK除外 で絞り込む。
  const pool = useMemo(() => {
    let list = withWords
    if (settings.bmOnly) list = list.filter((d) => bookmarks.has('n:' + d.num))
    if (settings.skipOk) list = list.filter((d) => !okSet.has(d.num))
    return list.map((d) => d.num)
  }, [withWords, settings.bmOnly, settings.skipOk, bookmarks, okSet])

  const [state, setState] = useState<SlideState>(() =>
    initSlide(pool, settings.mode)
  )

  const byNum = useMemo(() => {
    const m = new Map<string, NumberEntry>()
    for (const d of numbers) m.set(d.num, d)
    return m
  }, [numbers])

  const curNum = currentId(state)
  const cur = curNum ? (byNum.get(curNum) ?? null) : null

  const persist = useCallback((next: SlideSettings) => {
    setSettings(next)
    saveSlideSettings(next)
  }, [])

  const handleNext = useCallback(() => {
    setState((s) => advance(s, pool, settings.mode))
  }, [pool, settings.mode])

  const handleBack = useCallback(() => {
    setPlaying(false)
    vibrate()
    setState((s) => goBack(s))
  }, [])

  // プールが変わって現在アイテムが消えた場合などは作り直す。
  const poolKey = pool.join(',')
  const prevPoolKey = useRef(poolKey)
  useEffect(() => {
    if (prevPoolKey.current === poolKey) return
    prevPoolKey.current = poolKey
    setState((s) => {
      const id = currentId(s)
      if (id && pool.includes(id)) return s
      return initSlide(pool, settings.mode)
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [poolKey])

  // 自動送り。playing 中は速度に応じてタイマーで次へ進む。
  useEffect(() => {
    if (!playing || pool.length === 0) return
    const id = setTimeout(handleNext, SLIDE_SPEEDS[settings.speed])
    return () => clearTimeout(id)
  }, [
    playing,
    settings.speed,
    pool.length,
    state.pos,
    state.history,
    handleNext,
  ])

  const setMode = useCallback(
    (mode: SlideMode) => {
      persist({ ...settings, mode })
    },
    [persist, settings]
  )

  const setSpeed = useCallback(
    (speed: number) => {
      persist({ ...settings, speed })
    },
    [persist, settings]
  )

  const toggleOk = useCallback(() => {
    if (!curNum) return
    vibrate()
    setOkSet((prev) => {
      const next = new Set(prev)
      if (next.has(curNum)) next.delete(curNum)
      else next.add(curNum)
      saveSlideOk(next)
      return next
    })
  }, [curNum])

  const isBm = curNum ? bookmarks.has('n:' + curNum) : false
  const isOk = curNum ? okSet.has(curNum) : false

  return (
    <div class="slide-tab">
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
        <div class="slide-seg">
          {SLIDE_SPEED_LABELS.map((label, i) => (
            <button
              key={label}
              class={'slide-seg-btn' + (settings.speed === i ? ' active' : '')}
              onClick={() => setSpeed(i)}
            >
              {label}
            </button>
          ))}
        </div>
        <button
          class={'slide-chip-btn' + (settings.bmOnly ? ' active' : '')}
          onClick={() => persist({ ...settings, bmOnly: !settings.bmOnly })}
        >
          ★のみ
        </button>
        <button
          class={'slide-chip-btn' + (settings.skipOk ? ' active' : '')}
          onClick={() => persist({ ...settings, skipOk: !settings.skipOk })}
        >
          OK除外
        </button>
      </div>

      <div class="slide-stage">
        {cur ? (
          <SlideCard d={cur} />
        ) : (
          <div class="slide-empty">
            {settings.bmOnly
              ? '★ブックマークがありません'
              : '表示できる数字がありません'}
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
          disabled={!curNum}
          onClick={toggleOk}
        >
          {isOk ? '✓ OK済' : 'OK印'}
        </button>
        <button
          class={'slide-btn star' + (isBm ? ' active' : '')}
          disabled={!curNum}
          onClick={() => {
            if (curNum) {
              vibrate()
              onToggleBm('n:' + curNum)
            }
          }}
        >
          {isBm ? '★' : '☆'}
        </button>
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
            handleNext()
          }}
        >
          次へ →
        </button>
      </div>
    </div>
  )
}

export default SlideshowTab
