import { h } from 'preact'
import type { ComponentChildren } from 'preact'
import { useLayoutEffect, useRef } from 'preact/hooks'
import { IconClose } from './Icons'
import type { SelectionNav } from '../lib/useSelection'

// 全画面共通の枠。片手持ちで親指が画面の上半分へ伸びないことを最優先にする。
//
//   ┌ main  ─ 読むだけの領域。中身は下端に寄せ、はみ出したら上へスクロール
//   ├ panel ─ Detail Panel。触るものなので dock の直上
//   └ dock  ─ Header / テスト入口 / 設定 / 切り替え / 入力パッド
//
// 以前は DOM 順を変えずに CSS の order で個別クラスを下へ送っていたが、
// 列挙漏れのクラスや flex でない親 (.test-screen) で上に残るものが出た。
// 位置は DOM 順そのもので決め、order は使わない。

type Props = {
  main: ComponentChildren
  panel?: ComponentChildren
  dock?: ComponentChildren
  /** テスト中。Tab Bar ごと覆う全画面にする (.test-screen) */
  isTest?: boolean
  class?: string
  /** 画面全体のタップ (答えを見たあと «どこでも押して次へ» など) */
  onClick?: (e: MouseEvent) => void
}

function Screen({ main, panel, dock, isTest, class: extra, onClick }: Props) {
  const cls = ['screen', isTest ? 'test-screen' : '', extra ?? '']
    .filter(Boolean)
    .join(' ')
  return (
    <div class={cls} onClick={onClick}>
      {/* column-reverse のスクロール領域は初期位置が下端になる。中身を 1 つの
          子に包むので、中身自体の並び順は逆転しない */}
      <div class="screen-main">
        <div class="screen-main-inner">{main}</div>
      </div>
      {panel ? <div class="screen-panel">{panel}</div> : null}
      {dock ? <div class="screen-dock">{dock}</div> : null}
    </div>
  )
}

type DockBarProps = {
  title?: ComponentChildren
  sub?: ComponentChildren
  /** 右端に置く操作 (終了 など)。左端には置かない */
  children?: ComponentChildren
}

// dock の 1 行目 (旧 .pi-header / .year-header)。タイトルは左、操作は右に寄せる
export function DockBar({ title, sub, children }: DockBarProps) {
  return (
    <div class="dock-bar">
      {title || sub ? (
        <div class="dock-bar-text">
          {title ? <span class="dock-bar-title">{title}</span> : null}
          {sub ? <span class="dock-bar-sub">{sub}</span> : null}
        </div>
      ) : null}
      {children ? <div class="dock-bar-actions">{children}</div> : null}
    </div>
  )
}

/**
 * panel に詳細カードを複数枚積むとき (2桁グループの 10 枚、π の 2 枚)。
 * 各カードが自前の ★ / 編集 を持つので、積んだまま見せると上のカードの操作が
 * 画面上半分に来る。枠を先頭カード 1 枚分の高さにしてカード単位でスナップさせ、
 * 先頭のカードを下端 (親指側) に置く。高さはカードごとに違うので実測する
 */
export function PanelCards({ children }: { children: ComponentChildren }) {
  const frameRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const frame = frameRef.current
    const first = frame?.querySelector('.stack-up > *')
    if (!frame || !(first instanceof HTMLElement)) return
    frame.style.maxHeight = first.offsetHeight + 'px'
  })

  return (
    <div class="panel-cards" ref={frameRef}>
      <div class="stack-up">{children}</div>
    </div>
  )
}

/** dock 内の 1 段 (設定の行、切り替えボタン群など) */
export function DockRow({ children }: { children: ComponentChildren }) {
  return <div class="dock-row">{children}</div>
}

/**
 * テスト画面の終了ボタン。全テストで同じ見た目・同じ位置 (DockBar の右端)。
 * «採点» や «一覧へ戻る» のように閉じるのでない操作は icon={false} で × を外す
 */
export function QuitButton({
  onClick,
  label = '終了',
  icon = true,
}: {
  onClick: () => void
  label?: string
  icon?: boolean
}) {
  return (
    <button class="filter-btn quit-btn" onClick={onClick}>
      {icon ? <IconClose /> : null}
      <span>{label}</span>
    </button>
  )
}

/** 詳細カードの «閉じる»。ブックマーク / 編集と同じ段に並べ、それより一回り広く目立たせる */
export function CloseButton({ onClick }: { onClick: () => void }) {
  return (
    <button class="detail-act act-close" onClick={onClick}>
      <IconClose />
      <span>閉じる</span>
    </button>
  )
}

/** カードを複数枚積む面 (π / 年号) や、カードの下に別の操作がある面の閉じる。積んだ側が 1 つだけ持つ */
export function PanelClose({ onClick }: { onClick: () => void }) {
  return (
    <div class="panel-foot">
      <CloseButton onClick={onClick} />
    </div>
  )
}

/**
 * 詳細パネルの «前へ / 次へ»。一覧を閉じずに隣の番号へ送る。
 * 閉じる・ブックマーク・編集の段の直上に置く (どの画面でも同じ位置)。
 * 行き先の番号をボタンに出すので、どこへ送られるかが押す前に分かる
 */
export function PanelNav({ nav }: { nav?: SelectionNav }) {
  if (!nav) return null
  return (
    <div class="detail-nav">
      <button
        class="detail-act act-nav"
        onClick={nav.onPrev ?? undefined}
        disabled={!nav.onPrev}
        aria-label="前へ"
      >
        <span>‹ 前へ{nav.prevLabel ? ` ${nav.prevLabel}` : ''}</span>
      </button>
      <button
        class="detail-act act-nav"
        onClick={nav.onNext ?? undefined}
        disabled={!nav.onNext}
        aria-label="次へ"
      >
        <span>{nav.nextLabel ? `${nav.nextLabel} ` : ''}次へ ›</span>
      </button>
    </div>
  )
}

export default Screen
