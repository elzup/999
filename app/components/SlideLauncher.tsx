import { h } from 'preact'
import { useCallback, useState } from 'preact/hooks'
import type { SlideDeck } from '../lib/slideDeck'
import { useBackGuard } from '../lib/useBackGuard'
import SlidePlayer from './SlidePlayer'
import TestFeatureList from './TestFeatureList'

type Props = {
  deck: SlideDeck
  bookmarks?: Set<string>
  onToggleBm?: (key: string) => void
}

// テスト一覧に「スライド」の入口を 1 行出し、押すと全画面のプレイヤーを重ねる。
// どのグループのテストサブタブにもデッキを渡すだけで置ける。
function SlideLauncher({ deck, bookmarks, onToggleBm }: Props) {
  const [isOpen, setIsOpen] = useState(false)
  const close = useCallback(() => setIsOpen(false), [])
  // 端末の «戻る» でプレイヤーだけ閉じる (積まないと PWA ごと閉じる)
  useBackGuard(isOpen, close)

  return (
    <>
      <TestFeatureList
        features={[
          {
            id: `${deck.id}-slide`,
            title: `${deck.title}（${deck.items.length}件）`,
            inputMethod: 'advance',
            onStart: () => setIsOpen(true),
          },
        ]}
      />
      {isOpen ? (
        <SlidePlayer
          deck={deck}
          bookmarks={bookmarks}
          onToggleBm={onToggleBm}
          onQuit={close}
        />
      ) : null}
    </>
  )
}

export default SlideLauncher
