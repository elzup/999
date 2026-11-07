// 1 番号の詳細カード。
//
// 複数枚を縦に積む面がある (π の 2 枚、2桁の 10 枚) ので、1 枚あたりの
// 情報量と縦幅を抑えることを優先する。カードが持つ操作は ★ / 編集 だけ。
// 閉じる・前へ / 次へ は DetailSheet (パネルの枠) の最下段に 1 つだけ置く。

import type { NumberEntry } from '../data/schema'
import Rankey from './Rankey'
import { IconEdit } from './Icons'
import { BookmarkButton } from './Screen'
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

/**
 * 人 / 物 / 念 の 1 欄 ("信長,空海#a") から、語の行に出ていない語を取り出す。
 * "ニーナ#a,#b" のように同じ語が続くものは 1 つにまとめてタグを合わせる
 */
function extraItems(
  raw: string,
  shownNames: Set<string>
): { name: string; tags: string[] }[] {
  const out: { name: string; tags: string[] }[] = []
  for (const item of parseTaggedItems(raw)) {
    const name = item.base || item.label
    if (shownNames.has(nameOf(name))) continue
    const same = out.find((x) => x.name === name)
    if (same) same.tags = [...new Set([...same.tags, ...item.tags])]
    else out.push({ name, tags: item.tags })
  }
  return out
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
  // 人 / 物 / 念 のうち、上の語の行に大きく出していないものだけをチップにする。
  // 以前は 人 / 物 の生の文字列、wh1〜wm2 の枠、タグ付きの語 を別々に並べていて、
  // 代表の語が 1 枚のカードに 3〜4 回出ていた。タグはその語のチップの中に付ける
  const extras = (
    [
      ['人', d.hito],
      ['物', d.mono],
      ['念', d.gainen],
    ] as const
  )
    .map(([label, raw]) => [label, extraItems(raw, shownNames)] as const)
    .filter(([, items]) => items.length > 0)

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

      {extras.length > 0 ? (
        <div class="detail-extras">
          {extras.map(([label, items]) => (
            <div key={label} class="detail-chip">
              <span class="dc-label">{label}</span>
              {items.map((item) => (
                <span key={item.name} class="dc-val">
                  {item.name}
                  {item.tags.map((tag) => (
                    <span key={tag} class="dc-tag">
                      #{tag}
                    </span>
                  ))}
                </span>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {/* カードの操作は ★ / 編集 だけ。閉じる・前へ / 次へ は DetailSheet の最下段 */}
      {onToggleBm || onEdit ? (
        <div class="detail-foot-actions">
          {onToggleBm && (
            <BookmarkButton on={isBm} onToggle={() => onToggleBm(bmKey)} />
          )}
          {onEdit && (
            <button
              class="detail-act act-edit"
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
