type Props = {
  on: boolean
  onToggle: () => void
}

/** テストヘッダーの «あとで見返す» 印。結果ビューで印の付いた問題が目立つ */
function MarkButton({ on, onToggle }: Props) {
  return (
    <button
      class={'mark-btn' + (on ? ' on' : '')}
      aria-pressed={on}
      title="あとで見返す印"
      onClick={(event) => {
        // 回答表示中は画面タップで次へ進むテストがあるので、印の操作で送らない
        event.stopPropagation()
        onToggle()
      }}
    >
      {on ? '⚑ 印' : '⚐ 印'}
    </button>
  )
}

export default MarkButton
