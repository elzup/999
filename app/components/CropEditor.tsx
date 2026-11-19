// 画像ピッカーの全画面プレビュー。選んだ画像の元画像を画面いっぱいに contain で出し、
// 400x400 に切り抜く範囲 (正方形の枠) を重ねる。枠はドラッグで動かし、ピンチ・ホイール・
// スライダーで大きさを変える。寄せ方のボタン (上・下・左・右・中央) は枠をそこへ置く。
//
// 決めた範囲は ImagePickerSheet が確定のときに /console/recrop の rect で送る。
// 画面の上半分に指を伸ばさない規約 (docs/screen-layout.md) に合わせ、操作はすべて下段に置く。
import { createPortal } from 'preact/compat'
import { useEffect, useRef, useState } from 'preact/hooks'
import {
  containSize,
  cropImageStyle,
  matchingPreset,
  MIN_SCALE,
  moveRect,
  presetRect,
  resizeRect,
  scaleOf,
  squareAt,
  type CropRect,
  type Size,
} from '../lib/cropRect'
import {
  CROP_BUTTONS,
  type CropPosition,
  type SlotImage,
} from '../lib/imagePicker'

/** 切り抜きの決め方。null は今の切り抜き (自動) のまま */
export type CropChoice = { rect: CropRect } | { position: CropPosition } | null

type Props = {
  image: SlotImage
  title: string
  choice: CropChoice
  isSaving: boolean
  /** 決めた切り抜きで戻る (まだ保存しない) */
  onApply: (choice: CropChoice) => void
  /** 決めた切り抜きでそのまま確定する */
  onDecide: (choice: CropChoice) => void
  onCancel: () => void
}

const POSITIONS = CROP_BUTTONS.map((b) => b.position)

type Pointer = { x: number; y: number }

export default function CropEditor({
  image,
  title,
  choice: initial,
  isSaving,
  onApply,
  onDecide,
  onCancel,
}: Props) {
  const source = image.sourceImageUrl ?? ''
  const [natural, setNatural] = useState<Size | null>(null)
  const [loadFailed, setLoadFailed] = useState(!source)
  const [box, setBox] = useState<Size | null>(null)
  const [choice, setChoice] = useState<CropChoice>(initial)
  const stageRef = useRef<HTMLDivElement>(null)
  const pointers = useRef(new Map<number, Pointer>())
  const pinch = useRef<{ dist: number; scale: number } | null>(null)

  // 元画像の大きさが分かったら、寄せ方で決めていた分を範囲に直す (枠で見せて動かせるように)
  const rect: CropRect | null =
    choice && natural
      ? 'rect' in choice
        ? choice.rect
        : presetRect(natural, choice.position)
      : null

  useEffect(() => {
    const stage = stageRef.current
    if (!stage) return
    const measure = () =>
      setBox({ width: stage.clientWidth, height: stage.clientHeight })
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(stage)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const shown = natural && box ? containSize(box, natural) : null
  const setRect = (next: CropRect) => setChoice({ rect: next })

  /** 表示の画素 → 元画像に対する割合 */
  const toRatio = (e: PointerEvent, el: HTMLElement) => {
    const r = el.getBoundingClientRect()
    return {
      x: (e.clientX - r.left) / r.width,
      y: (e.clientY - r.top) / r.height,
    }
  }

  const onPointerDown = (e: PointerEvent) => {
    if (!natural || !shown) return
    const el = e.currentTarget as HTMLElement
    el.setPointerCapture(e.pointerId)
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pointers.current.size === 2 && rect) {
      const [a, b] = [...pointers.current.values()]
      pinch.current = {
        dist: Math.hypot(a.x - b.x, a.y - b.y),
        scale: scaleOf(natural, rect),
      }
      return
    }
    // 自動のままの画像は、押した所を中心に短い辺いっぱいの枠を置いて始める
    if (!rect) {
      const p = toRatio(e, el)
      setRect(squareAt(natural, 1, p.x, p.y))
    }
  }

  const onPointerMove = (e: PointerEvent) => {
    const last = pointers.current.get(e.pointerId)
    if (!last || !rect || !natural || !shown) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pinch.current && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      if (pinch.current.dist > 0)
        setRect(
          resizeRect(
            natural,
            rect,
            (pinch.current.scale * pinch.current.dist) / dist
          )
        )
      return
    }
    setRect(
      moveRect(
        rect,
        (e.clientX - last.x) / shown.width,
        (e.clientY - last.y) / shown.height
      )
    )
  }

  const onPointerUp = (e: PointerEvent) => {
    pointers.current.delete(e.pointerId)
    if (pointers.current.size < 2) pinch.current = null
  }

  const onWheel = (e: WheelEvent) => {
    if (!rect || !natural) return
    e.preventDefault()
    setRect(
      resizeRect(natural, rect, scaleOf(natural, rect) * (1 + e.deltaY / 500))
    )
  }

  const active =
    natural && rect ? matchingPreset(natural, rect, POSITIONS) : null
  const scale = natural && rect ? scaleOf(natural, rect) : 1
  const label = !choice
    ? '自動 (今の切り抜き)'
    : 'position' in choice && !natural
      ? (CROP_BUTTONS.find((b) => b.position === choice.position)?.label ??
          '') + '寄せ'
      : active
        ? (CROP_BUTTONS.find((b) => b.position === active)?.label ?? '') +
          '寄せ'
        : `手動 (${Math.round(scale * 100)}%)`
  // 元画像を読めないときは、寄せ方だけ選べる (範囲はサーバが決める)
  const pickPosition = (position: CropPosition) =>
    setChoice(natural ? { rect: presetRect(natural, position) } : { position })
  const isPositionOn = (position: CropPosition) =>
    natural
      ? active === position
      : Boolean(choice && 'position' in choice && choice.position === position)

  return createPortal(
    <div
      class="ce-root"
      role="dialog"
      aria-label={`${title} の切り抜きを決める`}
    >
      <div class="ce-head">
        <span class="ce-title">{title}</span>
        <span class="ce-mode">{label}</span>
      </div>
      <div class="ce-stage" ref={stageRef}>
        {loadFailed ? (
          <div class="ce-failed">
            <img src={image.url} alt="" class="ce-fallback" />
            <div class="ce-note">
              {source
                ? '元画像を読み込めません (元のサイトが表示を断っている)。寄せ方だけ選べます'
                : '元画像の URL がありません'}
            </div>
          </div>
        ) : (
          <div
            class={'ce-canvas' + (rect ? ' has-frame' : '')}
            style={
              shown
                ? { width: `${shown.width}px`, height: `${shown.height}px` }
                : { visibility: 'hidden' }
            }
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
          >
            <img
              src={source}
              alt=""
              draggable={false}
              referrerpolicy="no-referrer"
              onLoad={(e) => {
                const img = e.currentTarget as HTMLImageElement
                setNatural({
                  width: img.naturalWidth,
                  height: img.naturalHeight,
                })
              }}
              onError={() => setLoadFailed(true)}
            />
            {rect ? (
              <div
                class="ce-frame"
                style={{
                  left: `${rect.x * 100}%`,
                  top: `${rect.y * 100}%`,
                  width: `${rect.w * 100}%`,
                  height: `${rect.h * 100}%`,
                }}
              />
            ) : null}
          </div>
        )}
        {!loadFailed && !natural ? (
          <div class="ce-note ce-loading">元画像を読み込み中…</div>
        ) : null}
      </div>
      <div class="ce-panel">
        <div class="ce-row">
          <div class="ce-result" aria-label="切り抜きの結果">
            {rect ? (
              <img
                src={source}
                alt=""
                referrerpolicy="no-referrer"
                style={cropImageStyle(rect)}
              />
            ) : (
              <img src={image.url} alt="" />
            )}
          </div>
          <div class="ce-controls">
            <div class="ce-buttons" role="group" aria-label="寄せ方">
              <button
                type="button"
                class={'filter-btn' + (!choice ? ' active' : '')}
                aria-pressed={!choice}
                onClick={() => setChoice(null)}
                title="今の切り抜き (自動) のままにする"
              >
                自動
              </button>
              {CROP_BUTTONS.map(({ position, label: text }) => (
                <button
                  key={position}
                  type="button"
                  class={
                    'filter-btn' + (isPositionOn(position) ? ' active' : '')
                  }
                  aria-pressed={isPositionOn(position)}
                  onClick={() => pickPosition(position)}
                >
                  {text}
                </button>
              ))}
            </div>
            <label class="ce-zoom">
              <span>大きさ</span>
              <input
                type="range"
                min={MIN_SCALE}
                max={1}
                step={0.01}
                value={scale}
                disabled={!natural}
                onInput={(e) => {
                  if (!natural) return
                  const next = Number((e.target as HTMLInputElement).value)
                  setRect(
                    resizeRect(
                      natural,
                      rect ?? presetRect(natural, 'centre'),
                      next
                    )
                  )
                }}
              />
            </label>
          </div>
        </div>
        <div class="ce-hint">
          {!natural
            ? ''
            : rect
              ? '枠をドラッグで動かし、ピンチ・スライダーで大きさを変える'
              : '画像を押すとそこに枠を置いて、切り抜きを決められる'}
        </div>
        <div class="ip-foot">
          <button class="filter-btn" type="button" onClick={onCancel}>
            やめる
          </button>
          <button
            class="filter-btn"
            type="button"
            disabled={isSaving}
            onClick={() => onApply(choice)}
          >
            決めて戻る
          </button>
          <button
            class="filter-btn ip-decide"
            type="button"
            disabled={isSaving}
            onClick={() => onDecide(choice)}
          >
            {isSaving ? '保存中…' : '✓ 確定'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
