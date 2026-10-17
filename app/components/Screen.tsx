import { h } from 'preact'
import type { ComponentChildren } from 'preact'
import { useLayoutEffect, useRef } from 'preact/hooks'

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

/** テスト画面の終了ボタン。全テストで同じ見た目・同じ位置 (DockBar の右端) */
export function QuitButton({
  onClick,
  label = '終了',
}: {
  onClick: () => void
  label?: string
}) {
  return (
    <button class="filter-btn quit-btn" onClick={onClick}>
      {label}
    </button>
  )
}

export default Screen
