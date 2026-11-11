// 1 番号の詳細カード。
//
// 複数枚を縦に積む面がある (π の 2 枚、2桁の 10 枚) ので、1 枚あたりの
// 情報量と縦幅を抑えることを優先する。カードが持つ操作は ★ / 編集 だけ。
// 閉じる・前へ / 次へ は DetailSheet (パネルの枠) の最下段に 1 つだけ置く。

import { useEffect, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import Rankey from './Rankey'
import { IconEdit } from './Icons'
import { BookmarkButton } from './Screen'
import { parseTaggedItems } from '../lib/tags'
import { nameOf, REP_STATUS_LABEL } from '../lib/numberDetail'
import { candidateAt } from '../lib/choice'
import { useNumberContext } from '../lib/numberContext'
import { marksMeaning, parseWord } from '../lib/wordTags'
import TaggedWord, { hasMarks } from './TaggedWord'
import { repRankOf, useRepInfo } from '../lib/useRepSlots'

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

type Kind = 'kind-h' | 'kind-m' | 'kind-g'
const kindOf = (slot: string): Kind =>
  slot.startsWith('wm') ? 'kind-m' : 'kind-h'
const KIND_LABEL: Record<Kind, string> = {
  'kind-h': '人',
  'kind-m': '物',
  'kind-g': '念',
}
const KIND_OF_LABEL: Record<string, Kind> = {
  人: 'kind-h',
  物: 'kind-m',
  念: 'kind-g',
}

type ExtraItem = { name: string; tags: string[]; labels: string[] }

/** タグ・ラベルを語の記法に戻す (TaggedWord に渡す) */
const toWord = (item: ExtraItem) =>
  item.name +
  item.tags.map((t) => '#' + t).join('') +
  item.labels.map((l) => ' -' + l).join('')

/**
 * 人 / 物 / 念 の 1 欄 ("信長,空海#a -n") から、語の行に出ていない語を取り出す。
 * "ニーナ#a,#b" のように同じ語が続くものは 1 つにまとめてタグを合わせる
 */
function extraItems(raw: string, shownNames: Set<string>): ExtraItem[] {
  const out: ExtraItem[] = []
  for (const item of parseTaggedItems(raw)) {
    const { base, labels } = parseWord(item.base || item.label)
    const own = parseWord(item.label).labels
    if (shownNames.has(nameOf(base))) continue
    const allLabels = [...new Set([...labels, ...own])]
    const same = out.find((x) => x.name === base)
    if (same) {
      same.tags = [...new Set([...same.tags, ...item.tags])]
      same.labels = [...new Set([...same.labels, ...allLabels])]
    } else out.push({ name: base, tags: item.tags, labels: allLabels })
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
  // 代表①② と確定状態 (編集画面で選ぶもの)。読めるまでは出さない
  const rep = useRepInfo(d.num)
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

  // タップで開いたもの。語の行はヨミと意味、チップの語は意味を出す。
  // 番号が変わったら (前へ / 次へ) 閉じた状態に戻す
  const [open, setOpen] = useState<Set<string>>(new Set())
  useEffect(() => setOpen(new Set()), [d.num])
  const toggle = (key: string) =>
    setOpen((cur) => {
      const next = new Set(cur)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  const meanings = [
    ...rows
      .filter((row) => open.has(row.slot) && hasMarks(row.word))
      .map((row) => row.word),
    ...extras.flatMap(([label, items]) =>
      items.filter((item) => open.has(`x:${label}:${item.name}`)).map(toWord)
    ),
  ].map((word) => {
    const { base, tags, labels } = parseWord(word)
    return { base, text: marksMeaning(tags, labels).join(' ・ ') }
  })

  return (
    <div class="detail-panel">
      <div class="detail-row1">
        {/* 番号の下に代表の確定状態。編集画面の代表欄と同じ文言・色 */}
        <div class="detail-idcol">
          <span class="detail-id">{d.num}</span>
          {rep ? (
            <span class={'detail-rep ' + rep.status}>
              {REP_STATUS_LABEL[rep.status]}
            </span>
          ) : null}
        </div>

        <div class="word-list">
          {rows.map((row) => (
            <div
              key={row.slot}
              class={
                'word-line ' +
                kindOf(row.slot) +
                (open.has(row.slot) ? ' open' : '')
              }
              onClick={() => toggle(row.slot)}
            >
              {/* 人 (wh) か 物 (wm) か。チップの 人 / 物 と同じ色 */}
              <span class="wl-kind">{KIND_LABEL[kindOf(row.slot)]}</span>
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
              {/* ヨミはフリガナの位置。普段は見せずに場所だけ取っておき、
                  タップで出す (出し入れで行の高さ・幅が変わらない) */}
              <span class={'detail-main-word' + (row.dim ? ' dim' : '')}>
                <ruby>
                  <TaggedWord word={row.word} />
                  <rt class="yomi">{row.kana ?? ''}</rt>
                </ruby>
              </span>
              {repRankOf(rep, row.word) ? (
                <span
                  class={'wl-rep ' + (rep?.status ?? '')}
                  title={`代表${repRankOf(rep, row.word) === 1 ? '①' : '②'}`}
                >
                  {repRankOf(rep, row.word) === 1 ? '①' : '②'}
                </span>
              ) : null}
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
            <div key={label} class={'detail-chip ' + KIND_OF_LABEL[label]}>
              <span class="dc-label">{label}</span>
              {items.map((item) => {
                const key = `x:${label}:${item.name}`
                const word = toWord(item)
                return (
                  <span
                    key={item.name}
                    class={'dc-val' + (hasMarks(word) ? ' tappable' : '')}
                    onClick={hasMarks(word) ? () => toggle(key) : undefined}
                  >
                    <TaggedWord word={word} />
                  </span>
                )
              })}
            </div>
          ))}
        </div>
      ) : null}

      {meanings.length > 0 ? (
        <ul class="detail-meanings">
          {meanings.map((m) => (
            <li key={m.base}>
              <span class="dm-word">{m.base}</span> {m.text}
            </li>
          ))}
        </ul>
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
