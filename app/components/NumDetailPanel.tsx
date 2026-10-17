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
import { candidateAt } from '../lib/choice'
import { useNumberContext } from '../lib/numberContext'

type Props = {
  d: NumberEntry
  /** 省略時は NumberContext の値を使う */
  bookmarks?: Set<string>
  onToggleBm?: (key: string) => void
  /**
   * この番号の編集を開く (REQ-NDV-012)。省略時は NumberContext の
   * openEditor (今のタブに重ねて開く) を使うので、どのタブでも鉛筆が出る
   */
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
  // 新旧の列名 (wh1 / w1 など) の読み替えは candidateAt に任せる
  const wh1 = candidateAt(d, 'wh1')
  const wm1 = candidateAt(d, 'wm1')
  const wh2 = candidateAt(d, 'wh2')
  const wm2 = candidateAt(d, 'wm2')

  if (wh1) {
    rows.push({
      slot: 'wh1',
      word: wh1.word,
      kana: wh1.kana,
      img: wh1.img,
      rk: d.w1Rk,
    })
  }
  if (wm1) {
    rows.push({
      slot: 'wm1',
      word: wm1.word,
      kana: wm1.kana,
      img: wm1.img,
      rk: d.w2Rk,
      dim: true,
    })
  }
  if (!wm1 && wh2) {
    rows.push({ slot: 'wh2', word: wh2.word, img: wh2.img, dim: true })
  }
  if (!wh1 && wm2) {
    rows.push({ slot: 'wm2', word: wm2.word, img: wm2.img, dim: true })
  }
  return rows
}

function NumDetailPanel(props: Props) {
  const { d } = props
  const ctx = useNumberContext()
  const bookmarks = props.bookmarks ?? ctx?.bookmarks
  const onToggleBm = props.onToggleBm ?? ctx?.onToggleBm
  const onEdit = props.onEdit ?? (ctx ? () => ctx.openEditor(d.num) : undefined)
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
        <div class="detail-idcol">
          <span class="detail-id">{d.num}</span>
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

      {/* 操作はカードの最下段。Detail Panel は dock の直上にあるので、ここが
          親指に一番近い (番号の下に置くと画面の中ほどまで指を伸ばすことになる) */}
      {onToggleBm || onEdit ? (
        <div class="detail-foot-actions">
          {onToggleBm && (
            <button
              class={'detail-act' + (isBm ? ' on' : '')}
              onClick={() => onToggleBm(bmKey)}
              aria-pressed={isBm}
              aria-label={isBm ? 'ブックマークを外す' : 'ブックマークに追加'}
            >
              {isBm ? <IconStar /> : <IconStarOutline />}
              <span>{isBm ? '登録済み' : 'ブックマーク'}</span>
            </button>
          )}
          {onEdit && (
            <button
              class="detail-act"
              onClick={onEdit}
              aria-label={`${d.num} を編集`}
            >
              <IconEdit />
              <span>編集</span>
            </button>
          )}
        </div>
      ) : null}
    </div>
  )
}

export default NumDetailPanel
