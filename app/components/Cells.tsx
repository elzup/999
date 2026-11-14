// 一覧のマス (番号・カード)。全体 / 日付 / ブックマーク / カード で同じものを使う。
// 以前はブックマークに別のコピーがあり、«語があるか» の判定がずれていた
// (2〜3 番手だけ語がある番号が、ブックマークでだけ空に見えた)。
import { h } from 'preact'
import type { CardEntry, CardStats, NumberEntry } from '../data/schema'
import { formatCardId } from '../data/cards'
import { candidatesOf, type Candidate } from '../lib/choice'
import { nameOf } from '../lib/numberDetail'
import { wordImage } from '../lib/wordImage'

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
// md カードは 3 列で画面幅の 1/3 ほど (スマホで 120px 前後)
const MD_CARD_PX = 140

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
 */
export function NumMdCard({
  num,
  cand,
  selected,
  onSelect,
}: {
  num: string
  cand: Candidate | undefined
  selected: boolean
  onSelect: () => void
}) {
  return (
    <div
      class={'md-card' + (selected ? ' selected' : '')}
      onClick={onSelect}
    >
      {cand?.img ? (
        <img
          class="md-card-img"
          {...wordImage(cand.img, MD_CARD_PX, cand.word)}
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
export function BmNumCard({ d, selected, onSelect }: NumCellProps) {
  return (
    <NumMdCard
      num={d.num}
      cand={leadCandidates(d)[0]}
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
