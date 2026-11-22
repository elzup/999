// 一覧のマス (番号・カード)。全体 / 日付 / ブックマーク / カード で同じものを使う。
// 以前はブックマークに別のコピーがあり、«語があるか» の判定がずれていた
// (2〜3 番手だけ語がある番号が、ブックマークでだけ空に見えた)。
import { h } from 'preact'
import type { CardEntry, CardStats, NumberEntry } from '../data/schema'
import { formatCardId } from '../data/cards'
import { candidatesOf, type Candidate } from '../lib/choice'
import { nameOf } from '../lib/numberDetail'
import { wordImage } from '../lib/wordImage'
import { IMAGE_SLOT_OF, useImageOverride } from '../lib/imagePicker'

function scoreColor(score: number | null): string | null {
  if (score === null || score === undefined) return null
  return score >= 3.5 ? '#4ade80' : score >= 2.5 ? '#fbbf24' : '#f87171'
}

type NumCellProps = {
  d: NumberEntry
  selected: boolean
  onSelect: () => void
}

export function NumCell({ d, selected, onSelect }: NumCellProps) {
  const hasWord = candidatesOf(d).length > 0
  const sc = d.w1Score != null ? d.w1Score : d.w2Score
  const color = scoreColor(sc)
  const borderStyle = color && !selected ? { borderColor: color + '66' } : {}

  return (
    <div
      class={
        'num-cell' + (selected ? ' selected' : '') + (!hasWord ? ' empty' : '')
      }
      style={borderStyle}
      onClick={onSelect}
    >
      <div class="num-id">{d.num}</div>
      {color ? (
        <div class="num-score-dot" style={{ background: color }} />
      ) : null}
    </div>
  )
}

type CardCellProps = {
  c: CardEntry
  selected: boolean
  onSelect: () => void
  /** テストの成績 (カードタブだけ出す) */
  stat?: CardStats[string]
}

export function CardCell({ c, selected, stat, onSelect }: CardCellProps) {
  const avgSec =
    stat && stat.attempts > 0
      ? (stat.totalTime / stat.attempts / 1000).toFixed(1)
      : null
  return (
    <div class={'card-cell' + (selected ? ' selected' : '')} onClick={onSelect}>
      <div class={'card-id ' + c.suit}>{formatCardId(c)}</div>
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

// ブックマークは数が少ないので、番号だけのマスより語と画像が見えるカードにする
// (並べて眺めて思い出す面なので、開かなくても何の語か分かるほうがよい)
// md カードはスマホで 3 列 (120px 前後)、広い画面では 1 枚 170px で止まって列が増える (.md-grid)
const MD_CARD_PX = 170

/** 人 / 物 の先頭の候補を 1 つずつ (人 → 物 の順) */
function leadCandidates(d: NumberEntry): Candidate[] {
  const all = candidatesOf(d)
  const hito = all.find((c) => c.slot.startsWith('wh'))
  const mono = all.find((c) => c.slot.startsWith('wm'))
  return [hito, mono].filter((c): c is Candidate => c !== undefined)
}

/**
 * 番号の md カード (UI 候補 A-2): 画像 1 枚を枠いっぱいに出し、番号を左上、語を下の帯に重ねる。
 * どの語を出すかは画面が決めて渡す (ブックマークは人の先頭、タグ一覧はそのタグの語)
 * open が false の間は番号だけを伏せた札の上に出す (UI 候補 A-4)。画像も名前も描かないので、
 * 押すまで自分で思い出せる
 */
export function NumMdCard({
  num,
  cand,
  open = true,
  selected,
  onSelect,
}: {
  num: string
  cand: Candidate | undefined
  open?: boolean
  selected: boolean
  onSelect: () => void
}) {
  // 詳細パネルで選び直した画像は次のデプロイまで配信データに無いので、詳細の語の行と同じく
  // override で見せる。タグ違いで分けた語の画像 (tagImages) は枠の画像と別物なので使わない
  const slot = cand ? (IMAGE_SLOT_OF[cand.slot] ?? cand.slot) : ''
  const override = useImageOverride(num, slot)
  const img = cand?.variant ? cand.img : (override?.url ?? cand?.img)
  if (!open) {
    return (
      <div
        class={'md-card is-closed' + (selected ? ' selected' : '')}
        onClick={onSelect}
      >
        <span class="md-card-num">{num}</span>
      </div>
    )
  }
  return (
    <div class={'md-card' + (selected ? ' selected' : '')} onClick={onSelect}>
      {cand && img ? (
        <img
          class="md-card-img"
          {...wordImage(img, MD_CARD_PX, cand.word)}
          alt=""
          loading="lazy"
        />
      ) : (
        <span class="md-card-img is-empty">
          {cand ? nameOf(cand.word).slice(0, 1) : ''}
        </span>
      )}
      <span class="md-card-num">{num}</span>
      <span class="md-card-word">{cand ? nameOf(cand.word) : '語なし'}</span>
    </div>
  )
}

/** ブックマークの md カード。画像は人の先頭 (無ければ物の先頭) */
export function BmNumCard({
  d,
  open,
  selected,
  onSelect,
}: NumCellProps & { open?: boolean }) {
  return (
    <NumMdCard
      num={d.num}
      cand={leadCandidates(d)[0]}
      open={open}
      selected={selected}
      onSelect={onSelect}
    />
  )
}

export function BmCardCard({
  c,
  selected,
  onSelect,
}: Omit<CardCellProps, 'stat'>) {
  const names = [c.person, c.object].filter(Boolean)
  return (
    <div class={'bm-card' + (selected ? ' selected' : '')} onClick={onSelect}>
      <div class={'bm-suit card-id ' + c.suit}>{formatCardId(c)}</div>
      <div class="bm-words">{names.length ? names.join(' / ') : '語なし'}</div>
    </div>
  )
}

/**
 * グループ画面のタグの md カード。番号の md カードと同じ枠で、左上に語の数、
 * 下の帯に正式名と小さく #タグ。画像はそのタグの語の 1 枚 (無ければ正式名の頭文字)
 */
export function TagMdCard({
  tag,
  title,
  short,
  count,
  cand,
  onSelect,
}: {
  tag: string
  title: string
  /** 略称 (short_title)。正式名と違うときだけ小さく添える (#id は出さない) */
  short?: string
  count: number
  /** 画像を出す語。語も渡すのは概念 (#g) の額縁を付けるため */
  cand: Candidate | undefined
  onSelect: () => void
}) {
  return (
    <button
      type="button"
      class="md-card tag-md-card"
      onClick={onSelect}
      data-tag={tag}
    >
      {cand?.img ? (
        <img
          class="md-card-img"
          {...wordImage(cand.img, MD_CARD_PX, cand.word)}
          alt=""
          loading="lazy"
        />
      ) : (
        <span class="md-card-img is-empty">{title.slice(0, 1)}</span>
      )}
      <span class="md-card-num">{count}</span>
      <span class="md-card-word">
        {title}
        {short && short !== title ? (
          <span class="tag-md-card-id">{short}</span>
        ) : null}
      </span>
    </button>
  )
}
