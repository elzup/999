import { h } from 'preact'
import { useMemo } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import SlidePlayer from './SlidePlayer'
import { numberDeck } from './slideDecks'

type Props = {
  numbers: NumberEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
}

// Tab Bar の「スライド」。数字デッキを常時表示のプレイヤーで流す。
function SlideshowTab({ numbers, bookmarks, onToggleBm }: Props) {
  const deck = useMemo(() => numberDeck(numbers), [numbers])
  return (
    <SlidePlayer deck={deck} bookmarks={bookmarks} onToggleBm={onToggleBm} />
  )
}

export default SlideshowTab
