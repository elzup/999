// 1 番号の詳細カード。
//
// 複数枚を縦に積む面がある (π / 年号 / 2桁 は map で並べる) ので、1 枚あたりの
// 情報量と縦幅を抑えることを優先する。閉じるボタンはこのカードには置かない
// (積んだ枚数だけ «閉じる» が並んでしまう)。閉じるは並べた側が 1 つだけ持つ。

import type { NumberEntry } from '../data/schema'
import ScoreBar from './ScoreBar'
import Rankey from './Rankey'
import { IconEdit, IconStar, IconStarOutline } from './Icons'
import { parseTaggedItems } from '../lib/tags'

type Props = {
  d: NumberEntry
  bookmarks?: Set<string>
  onToggleBm?: (key: string) => void
  /** 語をタップして編集に入る (REQ-NDV-012)。渡されたときだけ鉛筆が出る */
  onEditWord?: (slot: string) => void
}

type WordRow = {
  slot: string
  label: string
  word: string
  kana?: string
  img?: string
  score?: number | null
  error?: string | boolean
  rk?: string
  dim?: boolean
}

const scoreErrorLabel = (error: string | boolean | undefined) =>
  typeof error === 'string' ? error : error ? 'error' : undefined

/**
 * 表示する語の行を組み立てる。
 *
 * 2 枠目の穴埋め (mono が空なら人の 2 人目、hito が空なら物の 2 つ目) は
 * 元の表示規則をそのまま踏襲している。スコアと rankey を持つのは 1 番手だけ。
 */
function wordRows(d: NumberEntry): WordRow[] {
  const rows: WordRow[] = []
  const wh1 = d.wh1 || d.w1
  const wm1 = d.wm1 || d.w2

  if (wh1) {
    rows.push({
      slot: 'wh1',
      label: 'WH1',
      word: wh1,
      kana: d.wh1k || d.w1k,
      img: d.wh1Img || d.w1Img,
      score: d.w1Score,
      error: d.w1Error,
      rk: d.w1Rk,
    })
  }
  if (wm1) {
    rows.push({
      slot: 'wm1',
      label: 'WM1',
      word: wm1,
      kana: d.wm1k || d.w2k,
      img: d.wm1Img || d.w2Img,
      score: d.w2Score,
      error: d.w2Error,
      rk: d.w2Rk,
      dim: true,
    })
  }
  if (!wm1 && (d.wh2 || d.w1_2)) {
    rows.push({
      slot: 'wh2',
      label: 'WH2',
      word: (d.wh2 || d.w1_2) as string,
      img: d.wh2Img || d.w1_2Img,
      dim: true,
    })
  }
  if (!wh1 && (d.wm2 || d.w2_2)) {
    rows.push({
      slot: 'wm2',
      label: 'WM2',
      word: (d.wm2 || d.w2_2) as string,
      img: d.wm2Img || d.w2_2Img,
      dim: true,
    })
  }
  return rows
}

function NumDetailPanel({ d, bookmarks, onToggleBm, onEditWord }: Props) {
  const bmKey = 'n:' + d.num
  const isBm = bookmarks ? bookmarks.has(bmKey) : false
  const rows = wordRows(d)
  const tagged = [
    ['人', parseTaggedItems(d.hito)],
    ['物', parseTaggedItems(d.mono)],
    ['念', parseTaggedItems(d.gainen)],
  ] as const

  return (
    <div class="detail-panel">
      <div class="detail-row1">
        {/* 番号の下は 28px の見出しに対して行が余るので、そこに星を置く。
            番号に付く操作 (ブックマーク) と語に付く操作 (編集) を位置で分ける */}
        <div class="detail-idcol">
          <span class="detail-id">{d.num}</span>
          {onToggleBm && (
            <button
              class={'ico sm' + (isBm ? ' on' : '')}
              onClick={() => onToggleBm(bmKey)}
              aria-pressed={isBm}
              aria-label={isBm ? 'ブックマークを外す' : 'ブックマークに追加'}
            >
              {isBm ? <IconStar /> : <IconStarOutline />}
            </button>
          )}
        </div>

        <div class="word-list">
          {rows.map((row) => (
            <div key={row.slot} class="word-line">
              {row.img ? (
                <img
                  class="wl-img"
                  loading="lazy"
                  src={row.img}
                  alt={row.word}
                />
              ) : (
                <span class="wl-img empty" />
              )}
              <span class={'detail-main-word' + (row.dim ? ' dim' : '')}>
                {row.word}
                {row.kana ? (
                  <span class="detail-sub-word"> {row.kana}</span>
                ) : null}
              </span>
              <span class="wl-meta">
                {row.rk ? <Rankey value={row.rk} /> : null}
                {row.score != null ? (
                  <ScoreBar
                    label={row.label}
                    score={row.score}
                    error={scoreErrorLabel(row.error)}
                  />
                ) : null}
                {onEditWord && (
                  <button
                    class="ico sm edit"
                    onClick={() => onEditWord(row.slot)}
                    aria-label={`${row.slot} を編集`}
                    title={`${row.slot} を編集`}
                  >
                    <IconEdit />
                  </button>
                )}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div class="detail-row2">
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
        {d.catScore ? (
          <div class="detail-chip cat">
            <span class="dc-label">Cat</span>
            <span class="dc-val">{d.catScore}</span>
          </div>
        ) : null}
      </div>

      <div class="detail-body">
        <div class="detail-chip">
          <span class="dc-label">wh1</span>
          <span class="dc-val">{d.wh1 || d.w1 || '-'}</span>
        </div>
        <div class="detail-chip">
          <span class="dc-label">wh2</span>
          <span class="dc-val">{d.wh2 || d.w1_2 || '-'}</span>
        </div>
        <div class="detail-chip">
          <span class="dc-label">wm1</span>
          <span class="dc-val">{d.wm1 || d.w2 || '-'}</span>
        </div>
        <div class="detail-chip">
          <span class="dc-label">wm2</span>
          <span class="dc-val">{d.wm2 || d.w2_2 || '-'}</span>
        </div>
      </div>

      {tagged.some(([, items]) =>
        items.some((item) => item.tags.length > 0)
      ) ? (
        <div class="detail-tag-row">
          {tagged.map(([label, items]) =>
            items
              .filter((item) => item.tags.length > 0)
              .map((item) => (
                <div key={`${label}-${item.label}`} class="detail-tag-chip">
                  <span class="detail-tag-cat">{label}</span>
                  <span class="detail-tag-name">{item.base || item.label}</span>
                  <span class="detail-tag-tags">
                    {item.tags.map((tag) => `#${tag}`).join(' ')}
                  </span>
                </div>
              ))
          )}
        </div>
      ) : null}
    </div>
  )
}

export default NumDetailPanel
