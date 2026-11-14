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
const BM_THUMB_PX = 48

/** 人 / 物 の先頭の候補を 1 つずつ (人 → 物 の順) */
function leadCandidates(d: NumberEntry): Candidate[] {
  const all = candidatesOf(d)
  const hito = all.find((c) => c.slot.startsWith('wh'))
  const mono = all.find((c) => c.slot.startsWith('wm'))
  return [hito, mono].filter((c): c is Candidate => c !== undefined)
}

export function BmNumCard({ d, selected, onSelect }: NumCellProps) {
  const leads = leadCandidates(d)
  return (
    <div
      class={
        'bm-card' +
        (selected ? ' selected' : '') +
        (leads.length ? '' : ' empty')
      }
      onClick={onSelect}
    >
      <div class="bm-thumbs">
        {leads.map((c) =>
          c.img ? (
            <img
              key={c.slot}
              class="bm-thumb"
              {...wordImage(c.img, BM_THUMB_PX)}
              alt=""
              loading="lazy"
            />
          ) : (
            <span key={c.slot} class="bm-thumb empty">
              {nameOf(c.word).slice(0, 1)}
            </span>
          )
        )}
      </div>
      <div class="bm-num">{d.num}</div>
      <div class="bm-words">
        {leads.length ? leads.map((c) => nameOf(c.word)).join(' / ') : '語なし'}
      </div>
    </div>
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
