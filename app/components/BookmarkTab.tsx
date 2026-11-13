import { h } from 'preact'
import { useMemo } from 'preact/hooks'
import type { NumberEntry, CardEntry } from '../data/schema'
import { BmCardCard, BmNumCard } from './Cells'
import NumDetailPanel from './NumDetailPanel'
import CardDetailPanel from './CardDetailPanel'
import Screen from './Screen'
import { navAround, useSelection } from '../lib/useSelection'
import DetailSheet from './DetailSheet'

type Props = {
  numbers: NumberEntry[]
  cards: CardEntry[]
  bookmarks: Set<string>
  onToggleBm: (key: string) => void
  // 詳細を開いたら呼ぶ (復習リマインドの閲覧時刻更新)
  onView?: (key: string) => void
}

function BookmarkTab({ numbers, cards, bookmarks, onToggleBm, onView }: Props) {
  const openDetail = (key: string) => {
    setSelected((cur) => {
      const next = cur === key ? null : key
      if (next) onView?.(next)
      return next
    })
  }

  const bmNums = useMemo(() => {
    const keys = [...bookmarks]
      .filter((k) => k.startsWith('n:'))
      .map((k) => k.slice(2))
    return numbers.filter((d) => keys.includes(d.num))
  }, [numbers, bookmarks])

  const bmCards = useMemo(() => {
    const keys = [...bookmarks]
      .filter((k) => k.startsWith('c:'))
      .map((k) => k.slice(2))
    return cards.filter((c) => keys.includes(c.suit + c.rank))
  }, [cards, bookmarks])

  const { selected, select: setSelected } = useSelection<string>()

  // 前へ / 次へ は 数字 → カード の順。送った先も «見た» として記録する
  // (タップで開いたときと同じく、ブックマーク復習の既読に数える)
  const order = useMemo(
    () => [
      ...bmNums.map((d) => 'n:' + d.num),
      ...bmCards.map((c) => 'c:' + c.suit + c.rank),
    ],
    [bmNums, bmCards]
  )
  const nav = useMemo(
    () =>
      selected === null
        ? undefined
        : navAround(
            order,
            selected,
            (key) => {
              setSelected(key)
              onView?.(key)
            },
            (key) => key.slice(2)
          ),
    [order, selected, onView]
  )

  const selectedNum = useMemo(() => {
    if (!selected || !selected.startsWith('n:')) return null
    return numbers.find((d) => d.num === selected.slice(2)) || null
  }, [numbers, selected])

  const selectedCard = useMemo(() => {
    if (!selected || !selected.startsWith('c:')) return null
    return cards.find((c) => c.suit + c.rank === selected.slice(2)) || null
  }, [cards, selected])

  const panel = selectedNum ? (
    <DetailSheet nav={nav} onClose={() => setSelected(null)}>
      <NumDetailPanel d={selectedNum} />
    </DetailSheet>
  ) : selectedCard ? (
    <DetailSheet nav={nav} onClose={() => setSelected(null)}>
      <CardDetailPanel
        c={selectedCard}
        bookmarks={bookmarks}
        onToggleBm={onToggleBm}
      />
    </DetailSheet>
  ) : null

  const isEmpty = bmNums.length === 0 && bmCards.length === 0

  // 一覧は下から上へ積む: 数字の節が一番下 (親指側)、その上にカード
  const main = isEmpty ? (
    <div class="screen-empty">★をタップしてブックマーク追加</div>
  ) : (
    <div class="stack-up" style={{ '--stack-gap': '16px' }}>
      {bmNums.length > 0 ? (
        <section class="stack-up" style={{ '--stack-gap': '8px' }}>
          <div class="section-label">数字 ({bmNums.length})</div>
          <div class="grid-up" style={{ '--cols': 3, '--gap': '6px' }}>
            {bmNums.map((d) => (
              <BmNumCard
                key={d.num}
                d={d}
                selected={selected === 'n:' + d.num}
                onSelect={() => openDetail('n:' + d.num)}
              />
            ))}
          </div>
        </section>
      ) : null}
      {bmCards.length > 0 ? (
        <section class="stack-up" style={{ '--stack-gap': '8px' }}>
          <div class="section-label">カード ({bmCards.length})</div>
          <div class="grid-up" style={{ '--cols': 3, '--gap': '6px' }}>
            {bmCards.map((c) => {
              const key = c.suit + c.rank
              return (
                <BmCardCard
                  key={key}
                  c={c}
                  selected={selected === 'c:' + key}
                  onSelect={() => openDetail('c:' + key)}
                />
              )
            })}
          </div>
        </section>
      ) : null}
    </div>
  )

  return <Screen main={main} panel={panel} />
}

export default BookmarkTab
