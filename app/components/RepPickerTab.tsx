// 代表語ピッカー。代表語コンソール (console/rep.html) のスマホ版で、百の位ごとの
// 一覧から番号の代表 ①② を選んでいく。選んだ時点で確定する (コンソールと同じ)。
//
// 行は人 / 物の 2 段に候補チップを並べ、チップの左に画像を出す (D-0030)。
// dock は 絞り込み / 百の位 / 十の位ジャンプ (D-0029)。
import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type { ComponentChildren } from 'preact'
import Yomi from './Yomi'
import type { NumberEntry } from '../data/schema'
import { loadSubTab, saveSubTab } from '../data/storage'
import { fetchHundred, type NumberDoc } from '../lib/numberApi'
import type { SaveMark } from '../lib/opQueue'
import { listenWriteQueue, writeQueue } from '../lib/writeQueue'
import {
  saveMarkOf,
  useNumberDocs,
  usePendingCount,
  useRetrying,
  useSaveMarks,
} from '../lib/symbolStore'
import type { RepPick } from '../lib/numberApi'

type RepChange = { picks: RepPick[]; confirmed: boolean }
// 統計・悪い順を開いていないときの番号の一覧 (毎回新しい [] を作ると購読側が描き直す)
const NO_NUMS: string[] = []
import {
  candidateRows,
  withDeliveredImages,
  type SlotRow,
} from '../lib/numberDetail'
import { useNumberContext } from '../lib/numberContext'
import {
  confirmOp,
  decadeBreakdown,
  isStale,
  matchesFilter,
  REP_FILTERS,
  togglePick,
  type RepFilter,
} from '../lib/repPicker'
import Screen, { DockBar, DockRow } from './Screen'
import RepCard from './RepCard'
import RepStats from './RepStats'
import { Segmented } from './Segmented'
import { wordImage } from '../lib/wordImage'
import { useImageOverrides, withImageOverrides } from '../lib/imagePicker'
import {
  DIGITS,
  anchorTarget,
  loadHundred,
  saveHundred,
  scrollToNum,
} from '../lib/pickPosition'
import TaggedWord from './TaggedWord'
import WorstRankView from './WorstRankView'
import Rankey from './Rankey'
import { byGrade, decadeGrades, gradeColor } from '../lib/gradeColor'
import { gradeWords, patternName, type GradedWord } from '../lib/worstRank'

const VIEW_KEY = 'rep.view'
type View = 'rows' | 'cards' | 'stats' | 'worst'
const VIEWS: View[] = ['rows', 'cards', 'stats', 'worst']
const VIEW_LABELS: Record<View, string> = {
  rows: '行',
  cards: 'カード',
  stats: '統計',
  worst: '悪い順',
}
/** 百の位・状態で絞らず、1000 番号まとめて見る表示 */
const isWholeView = (view: View) => view === 'stats' || view === 'worst'
const MARK = ['', '①', '②']

type Props = {
  token: string
  numbers: NumberEntry[]
  /** 候補タブの [代表 | 画像] の切替。dock の見出しの位置に出す */
  modeSwitch?: ComponentChildren
  /** 画像から切り替えてきたときに見ていた番号。その行の位置で開く */
  anchor?: string | null
}

const RATING_LABEL: Record<string, string> = {
  '-1': '-1',
  '0': '0',
  '1': '+1',
  '2': '+2',
}

function PickChip({
  row,
  graded,
  onPick,
}: {
  row: SlotRow
  graded?: GradedWord
  onPick: () => void
}) {
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
        <img
          class="rp-thumb"
          {...wordImage(row.imageUrl, 44, row.word)}
          alt=""
          loading="lazy"
        />
      ) : (
        <span class="rp-thumb is-empty" />
      )}
      <span class="rp-word">
        <Yomi class="rp-kana" kana={row.kana} />
        <TaggedWord word={row.word} short />
        <span class="rp-grade-line">
          {graded ? (
            <span
              class="rp-grade"
              style={{ background: gradeColor(graded.worst) }}
              title={patternName(graded.ids[graded.ids.length - 1] ?? 'double')}
            >
              {graded.worst}
            </span>
          ) : null}
          {graded ? <Rankey value={graded.rankey} /> : null}
          <span
            class={
              'rp-rating' +
              (row.rating === null ? ' is-none' : ' is-v' + row.rating)
            }
          >
            {row.rating === null ? '未' : RATING_LABEL[String(row.rating)]}
          </span>
        </span>
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
  onPick: (key: string) => void
  onOpen?: () => void
}) {
  const images = useImageOverrides()
  const rows = withImageOverrides(
    withDeliveredImages(candidateRows(doc), entry),
    doc.num,
    images
  )
  // 人と物を混ぜて格の順 (悪い順と同じ判定)。採点できない語 (よみ無し) は後ろ
  const gradedByKey = new Map(gradeWords(doc).map((g) => [g.key, g]))
  const sorted = [...rows].sort((a, b) => {
    const ga = gradedByKey.get(a.key)
    const gb = gradedByKey.get(b.key)
    if (!ga || !gb) return Number(!ga) - Number(!gb)
    return byGrade(ga, gb)
  })
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
        {sorted.length ? (
          <div class="rp-chips">
            {sorted.map((row) => (
              <PickChip
                key={row.key}
                row={row}
                graded={gradedByKey.get(row.key)}
                onPick={() => onPick(row.key)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </li>
  )
}

function RepPickerTab({ token, numbers, modeSwitch, anchor }: Props) {
  const ctx = useNumberContext()
  // 百の位は画像側と共有する。見ていた番号があればその百の位で開く
  const [hundred, setHundred] = useState(() => {
    if (anchor) saveHundred(anchor[0])
    return anchor ? anchor[0] : loadHundred()
  })
  // この百の位の番号 (並び)。文書の中身は保存キューから引く (押した後の値を含む)
  const [nums, setNums] = useState<string[]>([])
  const [filter, setFilter] = useState<RepFilter>('all')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState('')
  // 行 (チップを横に並べて一覧) と カード (詳細カードを縦に並べて 1 件ずつ確定)
  const [view, setView] = useState<View>(() =>
    loadSubTab(VIEW_KEY, VIEWS, 'rows')
  )

  // 書き込みはアプリで 1 本の保存キューに積む (編集画面と同じ)。押した瞬間に黄、
  // 保存できたら緑。通信できなくても捨てずに送り直す。どのボタンもロックしない
  // 画面に出す文書・印・保存待ちはストア (symbolStore.ts) から読む。積むのはキュー
  const queue = writeQueue()
  useEffect(
    () =>
      listenWriteQueue({
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
        queue.setBases(list)
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

  // 統計・悪い順を開いたときだけ、1000 番号ぶん (百の位 10 個) を読む。読んだ百の位は一覧と共有する
  const [statsLoaded, setStatsLoaded] = useState(0)
  useEffect(() => {
    if (!isWholeView(view) || !token) return
    let alive = true
    const missing = DIGITS.filter((h) => !hundredCache.current.has(h))
    setStatsLoaded(DIGITS.length - missing.length)
    for (const h of missing) {
      fetchHundred(Number(h), token)
        .then((list) => {
          queue.setBases(list)
          hundredCache.current.set(h, list.map((doc) => doc.num).sort())
          if (alive) setStatsLoaded((n) => n + 1)
        })
        .catch((error) => alive && setStatus(String(error.message)))
    }
    return () => {
      alive = false
    }
  }, [view, token])
  const statsDocs = useNumberDocs(
    isWholeView(view)
      ? DIGITS.flatMap((h) => hundredCache.current.get(h) ?? [])
      : NO_NUMS
  )

  const docs = useNumberDocs(nums)
  const saveMarks = useSaveMarks()
  const retrying = useRetrying()
  // 保存待ちはアプリ全体 (他の百の位・編集画面の分も) を出す
  const pendingCount = usePendingCount()

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
  const progress = decadeBreakdown(docs)
  const grades = decadeGrades(docs, hundred)
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
    saveHundred(next)
    setHundred(next)
  }

  // 画像から切り替えてきたら、見ていた番号の行を下端に合わせる (読み込めた後に 1 度だけ)
  const isAnchored = useRef(!anchor)
  useEffect(() => {
    if (isAnchored.current || !anchor || !visible.length) return
    const target = anchorTarget(
      visible.map((doc) => doc.num),
      anchor
    )
    if (target && scrollToNum('.screen-main', target)) isAnchored.current = true
  })

  const chooseView = (next: View) => {
    saveSubTab(VIEW_KEY, next)
    setView(next)
  }

  const marks = Object.fromEntries(
    docs.map((doc) => [
      doc.num,
      saveMarkOf({ marks: saveMarks }, doc.num, 'rep'),
    ])
  ) as Record<string, SaveMark | undefined>
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

  const main =
    view === 'worst' ? (
      <WorstRankView
        docs={statsDocs}
        entries={entries}
        loadedHundreds={statsLoaded}
      />
    ) : view === 'stats' ? (
      <RepStats docs={statsDocs} loadedHundreds={statsLoaded} />
    ) : !visible.length ? (
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
        title={modeSwitch ?? '代表'}
        sub={`${doneCount}/${docs.length} 確定 · ${hundred}00-${hundred}99`}
      >
        <div class="rp-views">
          <Segmented
            ariaLabel="表示"
            options={VIEWS.map((id) => ({ id, label: VIEW_LABELS[id] }))}
            value={view}
            onChange={chooseView}
          />
        </div>
      </DockBar>
      {pendingCount || errorCount ? (
        <DockRow>
          <span class="dock-row-label rp-save-count">
            {pendingCount ? (
              <span class="rp-save pending">
                保存待ち {pendingCount}
                {retrying ? ' ・通信待ち' : ''}
              </span>
            ) : null}
            {errorCount ? (
              <span class="rp-save error">失敗 {errorCount}</span>
            ) : null}
          </span>
        </DockRow>
      ) : null}
      {isWholeView(view) ? null : (
        <>
          <Segmented
            label="状態"
            options={REP_FILTERS.map(([id, label]) => ({ id, label }))}
            value={filter}
            onChange={setFilter}
            cols={4}
          />
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
            {progress.map(({ total, counts }, decade) => {
              const [none, one, two] = counts
              // 全部確定したら枠ごと色を変える (①② まで揃えば青、① だけの番号が残れば緑)
              const done = total > 0 && none === 0
              const decadeGrade = grades[decade]
              const bad = decadeGrade.filter((g) => g === 'bad').length
              const empty = decadeGrade.filter((g) => g === null).length
              return (
                <button
                  key={decade}
                  class={
                    'rp-digit rp-decade' +
                    (done ? (one === 0 ? ' is-done2' : ' is-done1') : '')
                  }
                  onClick={() => jumpTo(decade)}
                  aria-label={`${hundred}${decade}0 へ (①② ${two} · ① だけ ${one} · 未確定 ${none} / ${total}。格の内訳: -1 だけ ${bad} · 語なし ${empty})`}
                >
                  {decade}0
                  {/* 10 番号の格を良い順に並べた内訳 (D-5)。語なしは地の色、-1 だけは暗い赤 */}
                  <span class="rp-decade-bar" aria-hidden="true">
                    {decadeGrade.map((g, i) => (
                      <i
                        key={i}
                        class={
                          g === null ? 'is-empty' : g === 'bad' ? 'is-bad' : ''
                        }
                        style={
                          typeof g === 'number'
                            ? { flex: 1, background: gradeColor(g) }
                            : { flex: 1 }
                        }
                      />
                    ))}
                  </span>
                </button>
              )
            })}
          </div>
        </>
      )}
    </>
  )

  return <Screen main={main} dock={dock} />
}

export default RepPickerTab
