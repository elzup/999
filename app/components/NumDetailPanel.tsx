// 1 番号の詳細カード。
//
// 複数枚を縦に積む面がある (π / 年号 / 2桁 は map で並べる) ので、1 枚あたりの
// 情報量と縦幅を抑えることを優先する。閉じるボタンはこのカードには置かない
// (積んだ枚数だけ «閉じる» が並んでしまう)。閉じるは並べた側が 1 つだけ持つ。

import type { NumberEntry } from '../data/schema'
import Rankey from './Rankey'
import { IconEdit, IconStar, IconStarOutline } from './Icons'
import { parseTaggedItems } from '../lib/tags'
import { nameOf } from '../lib/numberDetail'

type Props = {
  d: NumberEntry
  bookmarks?: Set<string>
  onToggleBm?: (key: string) => void
  /** この番号の編集を開く (REQ-NDV-012)。渡されたときだけ鉛筆が出る */
  onEdit?: () => void
}

type WordRow = {
  slot: string
  word: string
  kana?: string
  img?: string
  rk?: string
  dim?: boolean
}

/**
 * 表示する語の行を組み立てる。
 *
 * 2 枠目の穴埋め (mono が空なら人の 2 人目、hito が空なら物の 2 つ目) は
 * 元の表示規則をそのまま踏襲している。rankey を持つのは 1 番手だけ。
 */
function wordRows(d: NumberEntry): WordRow[] {
  const rows: WordRow[] = []
  const wh1 = d.wh1 || d.w1
  const wm1 = d.wm1 || d.w2

  if (wh1) {
    rows.push({
      slot: 'wh1',
      word: wh1,
      kana: d.wh1k || d.w1k,
      img: d.wh1Img || d.w1Img,
      rk: d.w1Rk,
    })
  }
  if (wm1) {
    rows.push({
      slot: 'wm1',
      word: wm1,
      kana: d.wm1k || d.w2k,
      img: d.wm1Img || d.w2Img,
      rk: d.w2Rk,
      dim: true,
    })
  }
  if (!wm1 && (d.wh2 || d.w1_2)) {
    rows.push({
      slot: 'wh2',
      word: (d.wh2 || d.w1_2) as string,
      img: d.wh2Img || d.w1_2Img,
      dim: true,
    })
  }
  if (!wh1 && (d.wm2 || d.w2_2)) {
    rows.push({
      slot: 'wm2',
      word: (d.wm2 || d.w2_2) as string,
      img: d.wm2Img || d.w2_2Img,
      dim: true,
    })
  }
  return rows
}

function NumDetailPanel({ d, bookmarks, onToggleBm, onEdit }: Props) {
  const bmKey = 'n:' + d.num
  const isBm = bookmarks ? bookmarks.has(bmKey) : false
  const rows = wordRows(d)
  // 語の行にはタグ込みの語 (鯉#g) がそのまま出ている。同じものを
  // タグ行にもう一度出すと、1 枚のカードに同じ語が 2 回並ぶ
  const shownNames = new Set(rows.map((row) => nameOf(row.word)))
  const tagged = [
    ['人', parseTaggedItems(d.hito)],
    ['物', parseTaggedItems(d.mono)],
    ['念', parseTaggedItems(d.gainen)],
  ] as const

  return (
    <div class="detail-panel">
      <div class="detail-row1">
        {/* 番号の下は 28px の見出しに対して行が余るので、そこに操作を置く。
            どちらも «この番号に対する» 操作なので同じ列にまとめる */}
        <div class="detail-idcol">
          <span class="detail-id">{d.num}</span>
          <div class="detail-idcol-actions">
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
            {onEdit && (
              <button
                class="ico sm edit"
                onClick={onEdit}
                aria-label={`${d.num} を編集`}
                title={`${d.num} を編集`}
              >
                <IconEdit />
              </button>
            )}
          </div>
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
              {/* 出すのは rankey だけ。スコアのチップ (min-width 120px) を
                  行に置くと縮む余地が無くなり、横スクロールが出ていた */}
              {row.rk ? (
                <span class="wl-meta">
                  <Rankey value={row.rk} />
                </span>
              ) : null}
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
        items.some(
          (item) =>
            item.tags.length > 0 &&
            !shownNames.has(nameOf(item.base || item.label))
        )
      ) ? (
        <div class="detail-tag-row">
          {tagged.map(([label, items]) =>
            items
              .filter(
                (item) =>
                  item.tags.length > 0 &&
                  !shownNames.has(nameOf(item.base || item.label))
              )
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
