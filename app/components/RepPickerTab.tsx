// 代表語ピッカー。代表語コンソール (console/rep.html) のスマホ版で、百の位ごとの
// 一覧から番号の代表 ①② を選んでいく。選んだ時点で確定する (コンソールと同じ)。
//
// 行は人 / 物の 2 段に候補チップを並べ、チップの左に画像を出す (D-0030)。
// dock は 絞り込み / 百の位 / 十の位ジャンプ (D-0029)。
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { loadSubTab, saveSubTab } from '../data/storage'
import { fetchHundred, type NumberDoc } from '../lib/numberApi'
import type { SaveMark } from '../lib/opQueue'
import { listenWriteQueue, writeQueue } from '../lib/writeQueue'
import type { RepPick } from '../lib/numberApi'

type RepChange = { picks: RepPick[]; confirmed: boolean }
import {
  slotRows,
  withDeliveredImages,
  type SlotRow,
} from '../lib/numberDetail'
import { useNumberContext } from '../lib/numberContext'
import {
  confirmOp,
  decadeProgress,
  isStale,
  matchesFilter,
  REP_FILTERS,
  togglePick,
  type RepFilter,
} from '../lib/repPicker'
import Screen, { DockBar, DockRow } from './Screen'
import RepCard from './RepCard'
import { wordImage } from '../lib/wordImage'

const HUNDRED_KEY = 'rep.hundred'
const VIEW_KEY = 'rep.view'
type View = 'rows' | 'cards'
const VIEWS: View[] = ['rows', 'cards']
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
const MARK = ['', '①', '②']

type Props = {
  token: string
  numbers: NumberEntry[]
}

function PickChip({ row, onPick }: { row: SlotRow; onPick: () => void }) {
  return (
    <button
      class={
        'rp-chip ' +
        (row.slot.startsWith('wh') ? 'is-hito' : 'is-mono') +
        (row.repRank ? ' is-rank' + row.repRank : '')
      }
      aria-pressed={row.repRank > 0}
      onClick={onPick}
    >
      {row.imageUrl ? (
        <img class="rp-thumb" {...wordImage(row.imageUrl, 28)} alt="" loading="lazy" />
      ) : (
        <span class="rp-thumb is-empty" />
      )}
      <span class="rp-word">
        <span class="rp-kana">{row.kana}</span>
        {row.word}
      </span>
      {row.repRank ? <span class="rp-mark">{MARK[row.repRank]}</span> : null}
    </button>
  )
}

function RepRow({
  doc,
  entry,
  mark,
  onPick,
  onOpen,
}: {
  doc: NumberDoc
  entry: NumberEntry | undefined
  /** 保存の状態 (黄 = 保存待ち / 緑 = 保存済み / 赤 = 失敗) */
  mark?: SaveMark
  onPick: (slot: string) => void
  onOpen?: () => void
}) {
  const rows = withDeliveredImages(slotRows(doc), entry)
  const kinds = [
    rows.filter((row) => row.slot.startsWith('wh')),
    rows.filter((row) => row.slot.startsWith('wm')),
  ]
  return (
    <li
      class={
        'rp-row' +
        (doc.rep?.confirmed ? ' is-done' : '') +
        (mark ? ' save-' + mark : '')
      }
      data-num={doc.num}
    >
      <button class="rp-num" onClick={onOpen} disabled={!onOpen}>
        {doc.num}
        {isStale(doc) ? <span class="rp-stale">⚠</span> : null}
      </button>
      <div class="rp-kinds">
        {kinds.map((list, i) =>
          list.length ? (
            <div class="rp-chips" key={i}>
              {list.map((row) => (
                <PickChip
                  key={row.slot}
                  row={row}
                  onPick={() => onPick(row.slot)}
                />
              ))}
            </div>
          ) : null
        )}
      </div>
    </li>
  )
}

function RepPickerTab({ token, numbers }: Props) {
  const ctx = useNumberContext()
  const [hundred, setHundred] = useState(() =>
    loadSubTab(HUNDRED_KEY, DIGITS, '0')
  )
  // この百の位の番号 (並び)。文書の中身は保存キューから引く (押した後の値を含む)
  const [nums, setNums] = useState<string[]>([])
  const [filter, setFilter] = useState<RepFilter>('all')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  // 行 (チップを横に並べて一覧) と カード (詳細カードを縦に並べて 1 件ずつ確定)
  const [view, setView] = useState<View>(() =>
    loadSubTab(VIEW_KEY, VIEWS, 'rows')
  )
  // まとめて確定は 2 回押しで実行する (1 回目で件数を見せて構える)
  const [bulkArmed, setBulkArmed] = useState(false)

  // 書き込みはアプリで 1 本の保存キューに積む (編集画面と同じ)。押した瞬間に黄、
  // 保存できたら緑。通信できなくても捨てずに送り直す。どのボタンもロックしない
  const queue = writeQueue()
  const [, bump] = useState(0)
  useEffect(
    () =>
      listenWriteQueue({
        onChange: () => bump((v) => v + 1),
        onError: (num, message) => setStatus(`${num}: ${message}`),
      }),
    []
  )

  // 読んだ百の位は覚えておき、切り替えたらすぐ出して読み直す (先読みはしない)
  const hundredCache = useRef(new Map<string, string[]>())
  useEffect(() => {
    if (!token) return
    const cached = hundredCache.current.get(hundred)
    setNums(cached ?? [])
    setLoading(!cached)
    setStatus('')
    let alive = true
    const read = (h: string) =>
      fetchHundred(Number(h), token).then((list) => {
        // 保存待ちの番号は、押した後の値 (と前提の時刻) をキューが残す
        for (const doc of list) queue.setBase(doc)
        const order = list.map((doc) => doc.num).sort()
        hundredCache.current.set(h, order)
        return order
      })
    read(hundred)
      .then((order) => {
        if (!alive) return
        setNums(order)
      })
      .catch((error) => alive && setStatus(String(error.message)))
      .finally(() => alive && setLoading(false))
    return () => {
      alive = false
    }
  }, [hundred, token])

  const docs = nums
    .map((num) => queue.view(num))
    .filter((doc): doc is NumberDoc => doc !== null)

  const entries = useMemo(
    () => new Map(numbers.map((entry) => [entry.num, entry])),
    [numbers]
  )
  // この絞り込みのあいだに触った番号。«選ぶ = 確定» なので、未確定で絞っていると
  // ① を選んだ瞬間にカードが消え、② を選べなかった。絞り込みや百の位を
  // 変えるまでは残す (一覧が詰まってガタつくのも防ぐ)
  const [kept, setKept] = useState<Set<string>>(new Set())
  useEffect(() => setKept(new Set()), [filter, hundred])
  const keep = (num: string) =>
    setKept((cur) => (cur.has(num) ? cur : new Set(cur).add(num)))
  const isVisible = (doc: NumberDoc) =>
    matchesFilter(doc, filter) || kept.has(doc.num)
  const visible = docs.filter(isVisible)
  const progress = decadeProgress(docs)
  const doneCount = docs.filter((doc) => doc.rep?.confirmed).length

  // 押した瞬間にキューへ積む (画面はキューの文書を出すので、その場で変わって黄)
  const change = (doc: NumberDoc, next: RepChange) => {
    keep(doc.num)
    setStatus('')
    queue.enqueue(doc.num, [{ op: 'rep', ...next }])
  }

  const pick = (doc: NumberDoc, slot: string) => {
    const picks = togglePick(doc, slot)
    change(doc, { picks, confirmed: picks.length > 0 })
  }

  // カードの «確定»。確定したら次の未確定のカードへ送る (保存の完了は待たない)
  const confirmOne = (doc: NumberDoc) => {
    const op = confirmOp(doc)
    if (!op) return
    change(doc, { picks: op.picks, confirmed: true })
    const order = docs.filter(isVisible)
    const after = order.slice(order.findIndex((d) => d.num === doc.num) + 1)
    const next = after.find((d) => confirmOp(d) !== null)
    if (next) {
      document
        .querySelector(`.rp-cards [data-num="${next.num}"]`)
        ?.scrollIntoView({ block: 'end', behavior: 'smooth' })
    }
  }

  const chooseHundred = (next: string) => {
    saveSubTab(HUNDRED_KEY, next)
    setHundred(next)
    setBulkArmed(false)
  }

  const chooseView = (next: View) => {
    saveSubTab(VIEW_KEY, next)
    setView(next)
  }

  // 表示中で «確定» できるもの (確定済み・要再確認は除く)
  const confirmable = visible.filter((doc) => confirmOp(doc) !== null)
  const staleCount = visible.filter((doc) => isStale(doc)).length

  // 表示中の未確定をまとめてキューに入れる。保存は裏でまとめて送る
  const confirmAll = () => {
    if (!bulkArmed) {
      setBulkArmed(true)
      window.setTimeout(() => setBulkArmed(false), 4000)
      return
    }
    setBulkArmed(false)
    for (const doc of confirmable) {
      const op = confirmOp(doc)
      if (op) change(doc, { picks: op.picks, confirmed: true })
    }
  }

  const marks = Object.fromEntries(
    docs.map((doc) => [doc.num, queue.mark(doc.num, 'rep')])
  ) as Record<string, SaveMark | undefined>
  // 保存待ちはアプリ全体 (他の百の位・編集画面の分も) を出す
  const pendingCount = queue.pendingCount()
  const errorCount = Object.values(marks).filter(
    (mark) => mark === 'error'
  ).length

  // 一覧は下から上へ積むので、十の位の先頭の行を画面の下端に合わせる
  const jumpTo = (decade: number) => {
    const target = visible.find((doc) => Number(doc.num[1]) >= decade)
    if (!target) return
    document
      .querySelector(`.rp-list [data-num="${target.num}"]`)
      ?.scrollIntoView({ block: 'end' })
  }

  if (!token) {
    return (
      <Screen
        main={
          <div class="screen-empty">
            代表を選ぶには認証が必要です (設定 &gt; タブ の認証)
          </div>
        }
      />
    )
  }

  const main = !visible.length ? (
    <div class="screen-empty">{loading ? '読み込み中…' : '該当なし'}</div>
  ) : view === 'cards' ? (
    // 詳細カードを縦に並べる。一覧と同じく下から上へ (先頭の番号が親指側)
    <div class="rp-cards stack-up" style={{ '--stack-gap': '8px' }}>
      {visible.map((doc) => (
        <RepCard
          key={doc.num}
          doc={doc}
          entry={entries.get(doc.num)}
          mark={marks[doc.num]}
          onPick={(slot) => pick(doc, slot)}
          onConfirm={() => confirmOne(doc)}
          onOpen={ctx ? () => ctx.openEditor(doc.num) : undefined}
        />
      ))}
    </div>
  ) : (
    <ul class="rp-list stack-up" style={{ '--stack-gap': '4px' }}>
      {visible.map((doc) => (
        <RepRow
          key={doc.num}
          doc={doc}
          entry={entries.get(doc.num)}
          mark={marks[doc.num]}
          onPick={(slot) => pick(doc, slot)}
          onOpen={ctx ? () => ctx.openEditor(doc.num) : undefined}
        />
      ))}
    </ul>
  )

  const dock = (
    <>
      {status ? <div class="rp-status">{status}</div> : null}
      <DockBar
        title="代表"
        sub={`${doneCount}/${docs.length} 確定 · ${hundred}00-${hundred}99`}
      >
        <div class="rp-views">
          {VIEWS.map((id) => (
            <button
              key={id}
              class={'rp-seg' + (view === id ? ' active' : '')}
              aria-pressed={view === id}
              onClick={() => chooseView(id)}
            >
              {id === 'rows' ? '行' : 'カード'}
            </button>
          ))}
        </div>
      </DockBar>
      {/* 表示中 (絞り込み後) の未確定をまとめて確定。代表が空の番号は既定 (①人1 ②物1) */}
      <DockRow>
        <button
          class={'filter-btn rp-bulk' + (bulkArmed ? ' armed' : '')}
          disabled={confirmable.length === 0}
          onClick={confirmAll}
        >
          {bulkArmed
            ? `もう一度押すと ${confirmable.length} 件を確定`
            : `表示中の未確定 ${confirmable.length} 件をまとめて確定`}
        </button>
        {pendingCount || errorCount ? (
          <span class="dock-row-label rp-save-count">
            {pendingCount ? (
              <span class="rp-save pending">
                保存待ち {pendingCount}
                {queue.retrying ? ' ・通信待ち' : ''}
              </span>
            ) : null}
            {errorCount ? (
              <span class="rp-save error">失敗 {errorCount}</span>
            ) : null}
          </span>
        ) : null}
        {staleCount ? (
          <span class="dock-row-label rp-bulk-note">
            要再確認 {staleCount} 件は除く
          </span>
        ) : null}
      </DockRow>
      <div class="rp-filters">
        {REP_FILTERS.map(([id, label]) => (
          <button
            key={id}
            class={'rp-seg' + (filter === id ? ' active' : '')}
            aria-pressed={filter === id}
            onClick={() => setFilter(id)}
          >
            {label}
          </button>
        ))}
      </div>
      <DockRow>
        <span class="dock-row-label">百</span>
        <div class="rp-digits">
          {DIGITS.map((d) => (
            <button
              key={d}
              class={'rp-digit' + (hundred === d ? ' active' : '')}
              aria-pressed={hundred === d}
              onClick={() => chooseHundred(d)}
            >
              {d}
            </button>
          ))}
        </div>
      </DockRow>
      <div class="rp-digits">
        {progress.map((ratio, decade) => (
          <button
            key={decade}
            class="rp-digit rp-decade"
            onClick={() => jumpTo(decade)}
            aria-label={`${hundred}${decade}0 へ (確定 ${Math.round(
              ratio * 100
            )}%)`}
          >
            {decade}0
            <i style={{ width: `${ratio * 100}%` }} />
          </button>
        ))}
      </div>
    </>
  )

  return <Screen main={main} dock={dock} />
}

export default RepPickerTab
