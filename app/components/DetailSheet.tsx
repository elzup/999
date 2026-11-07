// 詳細パネルの枠。詳細を出す画面はすべてこれ 1 つで組む。
//
//   ┌ 見出し (任意: 年コード «12 → 3» / 2桁 «12_ 10件»)
//   ├ カード (1 枚。積む面は PanelCards で先頭 1 枚分の高さにしてスクロール)
//   ├ グループの ★ (任意: 2桁)
//   └ ‹ 前 ｜ 閉じる ｜ 次 ›   ← 全画面で同じ最下段 (親指の位置)
//
// 以前は画面ごとに枠を手書きしていて、閉じるがカードの中だったりカードの外だったり、
// 前へ / 次へ の段の位置も画面で違った。カードは ★ / 編集 だけを持ち、
// 閉じると前後送りはここだけが持つ。
import { h } from 'preact'
import type { ComponentChildren } from 'preact'
import type { SelectionNav } from '../lib/useSelection'
import { BookmarkButton, CloseButton, PanelCards } from './Screen'

type Props = {
  /** 詳細カード (NumDetailPanel / CardDetailPanel)。stacked なら複数枚 */
  children: ComponentChildren
  /** カードを複数枚積む (π の 2 枚、2桁の 10 枚) */
  stacked?: boolean
  /** カードの上に出す見出し。id は大きく、sub は補足 */
  head?: { id: ComponentChildren; sub?: ComponentChildren }
  /** カードとは別の単位の ★ (2桁グループ)。カードの ★ と区別できる文言を渡す */
  groupBookmark?: {
    on: boolean
    onToggle: () => void
    label: { on: string; off: string }
  }
  /** 前へ / 次へ (useSelection の nav)。無ければ閉じるだけ */
  nav?: SelectionNav
  onClose: () => void
}

function DetailSheet({
  children,
  stacked,
  head,
  groupBookmark,
  nav,
  onClose,
}: Props) {
  return (
    <>
      {head ? (
        <div class="panel-head">
          <span class="detail-id">{head.id}</span>
          {head.sub ? <span class="panel-head-sub">{head.sub}</span> : null}
        </div>
      ) : null}
      {stacked ? <PanelCards>{children}</PanelCards> : children}
      {groupBookmark ? (
        <div class="panel-foot">
          <BookmarkButton
            on={groupBookmark.on}
            onToggle={groupBookmark.onToggle}
            label={groupBookmark.label}
          />
        </div>
      ) : null}
      <div class="panel-foot sheet-foot">
        {nav ? (
          <button
            class="detail-act act-nav"
            onClick={nav.onPrev ?? undefined}
            disabled={!nav.onPrev}
            aria-label="前へ"
          >
            <span>‹{nav.prevLabel ? ` ${nav.prevLabel}` : ''}</span>
          </button>
        ) : null}
        <CloseButton onClick={onClose} />
        {nav ? (
          <button
            class="detail-act act-nav"
            onClick={nav.onNext ?? undefined}
            disabled={!nav.onNext}
            aria-label="次へ"
          >
            <span>{nav.nextLabel ? `${nav.nextLabel} ` : ''}›</span>
          </button>
        ) : null}
      </div>
    </>
  )
}

export default DetailSheet
