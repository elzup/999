// 番号単位の統合ビュー。
// spec: .vsdd/firestore-store/specs/spec-number-detail-view.md
// UI 案: .metarc/editor-ui-drafts-v2.html の A-2 (カード型) + B-1 (⠿ ドラッグ)
//
// 4 つの面 (シート / 編集画面 / 代表語コンソール / 画像コンソール) に散っていた
// 操作を 1 番号ぶんの 1 画面に集める。読み書きは numbers/{num} だけを見る。

import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks'
import { fetchNumber, type PatchOp } from '../lib/numberApi'
import {
  applyDraftEdit,
  carryOverOps,
  changedSlots,
  livePicks,
  nextFreeSlot,
  type SlotFamily,
  mergeDraftRows,
  moveItem,
  nextRatingValue,
  RATING_VALUES,
  REP_STATUS_LABEL,
  repStatus,
  repPickOp,
  slotRows,
  slotsFromRows,
  splitRows,
  type SlotRow,
  withDeliveredImages,
} from '../lib/numberDetail'
import type { NumberEntry, RulesData } from '../data/schema'
import {
  checkReading,
  readingOf,
  tablesFromRules,
  type ReadingCheck,
  type ReadingTables,
} from '../lib/reading'
import { collectNumberTags } from '../lib/tags'
import {
  addLabel,
  addTag,
  baseText,
  LABELS,
  parseWord,
  removeLabel,
  removeTag,
  setBase,
  suggestTags,
  type TagSuggestion,
} from '../lib/wordTags'
import { writeQueue, listenWriteQueue } from '../lib/writeQueue'
import type { SaveMark } from '../lib/opQueue'
import Rankey from './Rankey'
import { WorstIdeas } from './WorstRankView'
import Screen, { DockBar, QuitButton } from './Screen'
import { IconStar, IconStarOutline } from './Icons'
import { wordImage } from '../lib/wordImage'
import { imageSlotOf, useImageOverride } from '../lib/imagePicker'
import ImagePickerSheet from './ImagePickerSheet'
import { useNumberContext } from '../lib/numberContext'
import { tagNameOf, useTagNames } from '../lib/tagNames'

const REP_RANKS = [1, 2] as const
const REP_LABEL: Record<1 | 2, string> = { 1: '①', 2: '②' }

const RATING_LABEL: Record<number, string> = {
  [-1]: '−1',
  [0]: '0',
  [1]: '+1',
  [2]: '+2',
}

/** dock の上に出す知らせ。failed なら失敗の理由 (次の操作まで残す) */
type Note = { status: string; failed?: boolean }
const EMPTY_NOTE: Note = { status: '' }

/** 保存状態の class (黄 = 保存待ち / 緑 = 保存済み / 赤 = 失敗) */
const saveClass = (mark?: SaveMark) => (mark ? ' save-' + mark : '')

// 成功の知らせを出しておく時間。失敗の理由は次の操作まで残す
const NOTICE_MS = 2000

export default function NumberDetailTab({
  token,
  initialNum = '000',
  focusSlot,
  numbers,
  rules,
  onClose,
}: {
  token: string
  /** 読みルール。かなが番号の読みになっているかの確認と、付け替え先の提案に使う */
  rules?: RulesData
  /** 配信データ。numbers/{num} に無い画像をここから補う */
  numbers?: NumberEntry[]
  initialNum?: string
  /** 999 タブで語をタップして入ったとき、その語にカーソルを置く (REQ-NDV-012) */
  focusSlot?: string
  onClose?: () => void
}) {
  const [num, setNum] = useState(initialNum)
  const [jump, setJump] = useState(initialNum)
  const [note, setNote] = useState<Note>(EMPTY_NOTE)
  // 保存は待たせない: 押した瞬間に画面へ出し (黄)、裏で順に送る (緑)。
  // 送っている間も他のボタンは押せる。キューはアプリで 1 つ (閉じて開き直しても
  // 読んだ文書と保存待ちが残る)
  const [, bump] = useState(0)
  const queue = writeQueue()
  const numRef = useRef(num)
  numRef.current = num
  useEffect(
    () =>
      listenWriteQueue({
        onChange: () => bump((v) => v + 1),
        onSettled: (target, message) => {
          if (target === numRef.current)
            setNote({ status: message ?? '保存しました' })
        },
        onError: (target, message) =>
          setNote({ status: `${target}: ${message}`, failed: true }),
      }),
    []
  )
  const [loading, setLoading] = useState(false)
  // 未保存の編集内容。保存に成功したら doc 側に取り込むので、ここは空に戻る
  const [drafts, setDrafts] = useState<Record<string, SlotRow>>({})
  const [dragFrom, setDragFrom] = useState<number | null>(null)
  // 別の番号へ移す欄を開いている枠
  const [moving, setMoving] = useState<string | null>(null)
  const tables = useMemo(() => (rules ? tablesFromRules(rules) : null), [rules])
  // タグ追加の候補。配信データの人・物の一覧で使われているタグを回数順に
  const ctx = useNumberContext()
  const tagNames = ctx?.tagNames
  const knownTags = useMemo<TagSuggestion[]>(
    () =>
      numbers
        ? collectNumberTags(numbers).map(({ tag, count }) => ({
            tag,
            count,
            name: tagNames?.[tag],
          }))
        : [],
    [numbers, tagNames]
  )

  /**
   * 番号を開く。読んだことのある番号 (詳細カード・マップ・候補タブの代表で読んだものを含む)
   * はすぐ出して読み直す。初めての番号だけ読み込みを待つ。先読みはしない
   */
  const load = useCallback(
    (target: string) => {
      if (!token) return
      const cached = queue.has(target)
      if (!cached) setLoading(true)
      setDrafts({})
      setMoving(null)
      fetchNumber(target, token)
        .then((doc) => {
          queue.setBase(doc)
          if (!cached) setNote(EMPTY_NOTE)
        })
        .catch((error) =>
          setNote({ status: String(error.message), failed: true })
        )
        .finally(() => setLoading(false))
    },
    [token]
  )

  useEffect(() => load(num), [num, load])

  useEffect(() => {
    if (!note.status || note.failed) return
    const timer = setTimeout(() => setNote(EMPTY_NOTE), NOTICE_MS)
    return () => clearTimeout(timer)
  }, [note.status, note.failed])

  /**
   * 操作をキューに積む。押した瞬間に画面へ出し、保存は裏で順に送る
   * (slots の保存に続けて代表・評価を付け直すときは複数をまとめて積む)
   */
  const sendAll = useCallback(
    (ops: PatchOp[], message?: string) => {
      const current = queue.view(num)
      if (!current || !ops.length) return
      setNote(EMPTY_NOTE)
      // 候補 (slots) を積んだら、下書きはもう画面の文書に入っている
      if (ops.some((op) => op.op === 'slots')) setDrafts({})
      queue.enqueue(current.num, ops, message)
    },
    [num, queue]
  )
  const send = useCallback(
    (op: PatchOp, message?: string) => sendAll([op], message),
    [sendAll]
  )

  const doc = queue.view(num)
  // 表示行 = 保存済みの内容に、未保存の編集を重ねたもの
  const entry = numbers?.find((item) => item.num === doc?.num)
  const rows: SlotRow[] = doc
    ? withDeliveredImages(mergeDraftRows(slotRows(doc), drafts), entry)
    : []
  // カードは出典タグごとに分ける (美咲#bang#ml → 美咲 #bang / 美咲 #ml、D-0133)。
  // DB と下書きは枠 (rows) のまま持ち、カードの操作は枠の語への書き換えに直して当てる
  const cards: SlotRow[] = doc
    ? withDeliveredImages(
        splitRows(mergeDraftRows(slotRows(doc), drafts), doc),
        entry
      )
    : []
  const picks = doc?.rep?.picks ?? []
  const repState = doc ? repStatus(doc) : 'open'
  const pendingCount = queue.pendingCount(num)
  const notice = loading
    ? '読み込み中…'
    : note.failed
      ? note.status
      : pendingCount
        ? `保存待ち ${pendingCount}${queue.retrying ? ' ・通信待ち (つながったら送ります)' : ''}`
        : note.status
  const changed = doc ? changedSlots(doc, drafts) : []
  const dirty = changed.length > 0

  // 番号を移る・読み直す・閉じると下書きは消える。黙って捨てない
  const leave = (go: () => void) => {
    if (
      dirty &&
      !window.confirm('保存していない変更があります。破棄しますか？')
    )
      return false
    go()
    return true
  }

  const saveSlots = useCallback(
    (nextRows: SlotRow[], message: string) => {
      if (!doc) return
      sendAll(
        [
          { op: 'slots', slots: slotsFromRows(nextRows, doc) },
          // タグ・ラベルだけの変更で代表と評価が外れないよう付け直す
          ...carryOverOps(doc, nextRows),
        ],
        message
      )
    },
    [doc, sendAll]
  )

  const editRow = useCallback((row: SlotRow, patch: Partial<SlotRow>) => {
    setDrafts((prev) => applyDraftEdit(prev, row, patch))
  }, [])

  const handleJump = (value: string) => {
    const digits = value.replace(/\D/g, '').slice(0, 3)
    setJump(digits)
    if (digits.length === 3 && digits !== num) {
      if (!leave(() => setNum(digits))) setJump(num)
    }
  }

  const step = (delta: number) => {
    const next = String((Number(num) + delta + 1000) % 1000).padStart(3, '0')
    leave(() => {
      setNum(next)
      setJump(next)
    })
  }

  /**
   * 語を別の番号へ付け替える。API は 1 番号 1 操作なので «移動先に足す → 移動元から抜く»
   * の順に送る (途中で落ちても語は消えない)。未保存の編集があると移動元の最終形が
   * 決まらないので、先に保存してもらう
   */
  /**
   * 語を別の番号へ付け替える。これもキューに積むだけで待たない: 移動元からはすぐ消えて
   * 黄になり、前に積んだ保存のあとに «移動先に足す → 移動元から抜く» の順で送られる
   * (途中で通信が切れても、済んだ段から続ける)。
   * この候補自体に未保存の書き換えがあると、どちらを移すか決まらないので先に保存してもらう
   */
  const moveWord = (row: SlotRow, to: string) => {
    if (!doc) return
    if (changed.includes(row.slot)) {
      setNote({
        status: 'この候補の変更を先に保存してください',
        failed: true,
      })
      return
    }
    setMoving(null)
    setNote(EMPTY_NOTE)
    queue.enqueueMove(
      doc.num,
      { row: { slot: row.slot, imageUrl: row.imageUrl }, to },
      `「${row.word}」を ${to} に移しました`
    )
  }

  const addRow = useCallback(
    (family: SlotFamily) => {
      const slot = nextFreeSlot(rows, family)
      if (!slot) {
        setNote({ status: '空き枠がありません (各 3 つまで)' })
        return
      }
      setDrafts((prev) => ({
        ...prev,
        [slot]: {
          key: slot,
          slot,
          word: '',
          kana: '',
          imageStale: false,
          rating: null,
          repRank: 0,
        },
      }))
    },
    [rows]
  )

  // ティアカバーの表は編集中の語 (下書き) で引く。打ったそばから線が変わる
  const coverKey = rows
    .map((row) => `${row.slot}\t${row.word}\t${row.kana}`)
    .join('\n')
  const coverEntry = useMemo(
    () =>
      Object.fromEntries([
        ['num', num],
        ...rows.flatMap((row) => [
          [row.slot, row.word],
          [row.slot + 'k', row.kana],
        ]),
      ]) as unknown as NumberEntry,
    // rows は描くたびに作り直されるので、中身 (枠・語・かな) で比べる
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [num, coverKey]
  )

  // 候補は優先順に下から積む (先頭が親指側)。悪い順の判定と良い当て方は上に出す
  const main = doc ? (
    <div class="nd-main">
      <WorstIdeas num={doc.num} doc={doc} entry={coverEntry} />
      <ul class="nd-cards stack-up" style={{ '--stack-gap': '8px' }}>
        {cards.map((card) => {
          const index = rows.findIndex((other) => other.slot === card.slot)
          const row = rows[index]
          return (
            <SlotCard
              key={card.key}
              token={token}
              row={card}
              slotWord={row.word}
              index={index}
              num={doc.num}
              tables={tables}
              knownTags={knownTags}
              moveOpen={moving === card.key}
              onToggleMove={() =>
                setMoving((prev) => (prev === card.key ? null : card.key))
              }
              onMove={(to) => moveWord(row, to)}
              focused={
                card.slot === focusSlot &&
                cards.find((c) => c.slot === card.slot) === card
              }
              repMark={queue.mark(doc.num, 'rep')}
              rateMark={queue.mark(doc.num, `rating:${card.kana}|${card.word}`)}
              isSaved={Boolean(doc.slots?.[row.slot])}
              changed={changed.includes(row.slot)}
              dragging={dragFrom === index}
              onDragStart={() => setDragFrom(index)}
              onDragEnd={() => setDragFrom(null)}
              onDropAt={() => {
                if (dragFrom === null || dragFrom === index) return
                saveSlots(
                  moveItem(rows, dragFrom, index),
                  dirty
                    ? '並べ替え、未保存の変更も保存しました'
                    : '並べ替えました'
                )
                setDragFrom(null)
              }}
              onEdit={(patch) => editRow(row, patch)}
              onDelete={() => {
                // タグ違いのカードは、そのタグだけ外す (枠には残りのタグの語が残る)
                const variant = card.variant
                if (variant) {
                  const word = removeTag(row.word, variant)
                  if (!doc.slots?.[row.slot]) {
                    editRow(row, { word })
                    return
                  }
                  saveSlots(
                    rows.map((other) =>
                      other.slot === row.slot ? { ...other, word } : other
                    ),
                    dirty
                      ? `#${variant} を外し、未保存の変更も保存しました`
                      : `#${variant} を外しました`
                  )
                  return
                }
                // 足しただけの枠は手元で消すだけ (サーバに送るものが無い)
                if (!doc.slots?.[row.slot]) {
                  setDrafts(({ [row.slot]: _, ...rest }) => rest)
                  return
                }
                // slots は最終形を送るので、他の枠の未保存の編集も一緒に保存される
                saveSlots(
                  rows.filter((other) => other.slot !== row.slot),
                  dirty ? '削除し、未保存の変更も保存しました' : '削除しました'
                )
              }}
              onPickRep={(rank) => {
                const op = repPickOp(
                  doc,
                  row.slot,
                  rank,
                  card.variant ? card.word : undefined
                )
                send(
                  op,
                  op.confirmed ? '代表を確定しました' : '代表を外しました'
                )
              }}
              onRate={(value) =>
                send(
                  {
                    op: 'rating',
                    k: card.kana,
                    w: card.word,
                    v: nextRatingValue(card.rating, value),
                  },
                  '評価を保存しました'
                )
              }
            />
          )
        })}
      </ul>
    </div>
  ) : null

  const bmKey = 'n:' + num
  const isBm = ctx?.bookmarks?.has(bmKey) ?? false

  const dock = (
    <div class="nd-dock">
      {/* 編集欄の間に差し込むと出るたびに行がずれるので、dock の真上に重ねて出す */}
      <p
        class={
          'nd-status' +
          (notice ? ' show' : '') +
          (note.failed && !loading ? ' error' : '') +
          (!note.failed && pendingCount && !loading ? ' pending' : '')
        }
        role="status"
        aria-live="polite"
      >
        {notice}
      </p>
      <DockBar>
        <button class="nd-step" onClick={() => step(-1)} aria-label="前の番号">
          −
        </button>
        <input
          class="nd-jump"
          inputMode="numeric"
          pattern="[0-9]*"
          value={jump}
          onInput={(event) => handleJump(event.currentTarget.value)}
        />
        <button class="nd-step" onClick={() => step(1)} aria-label="次の番号">
          ＋
        </button>
        {/* 詳細カードの ★ と同じブックマーク (キーも同じ n:番号) */}
        {ctx?.onToggleBm ? (
          <button
            class={'nd-ghost nd-bm' + (isBm ? ' on' : '')}
            onClick={() => ctx.onToggleBm?.(bmKey)}
            aria-pressed={isBm}
            aria-label={isBm ? 'ブックマークを外す' : 'ブックマークに追加'}
            title={isBm ? 'ブックマークを外す' : 'ブックマークに追加'}
          >
            {isBm ? <IconStar /> : <IconStarOutline />}
          </button>
        ) : null}
        {/* 番号送り (− ＋) と同じ箱にすると見分けがつかないので、枠なしで置く */}
        <button
          class="nd-ghost nd-reload"
          onClick={() => leave(() => load(num))}
          aria-label="読み直す"
          title="読み直す"
        >
          ↻
        </button>
        {onClose ? (
          <QuitButton label="閉じる" onClick={() => leave(onClose)} />
        ) : null}
      </DockBar>
      {doc ? (
        <>
          {/* 代表の状態はここ 1 か所にまとめる。①② を押した時点で «選ぶ = 確定»
              として保存されるので、確定の操作ボタンは置かない。状態だけを出す。
              代表はあるのに未確定 (確定を別操作にしていた頃のデータ) のときだけ、
              バッジを押して確定できる */}
          <section
            class={'nd-rep ' + repState + saveClass(queue.mark(doc.num, 'rep'))}
            aria-label="代表"
          >
            <button
              class={'nd-rep-state ' + repState}
              disabled={repState !== 'held'}
              title={
                repState === 'stale'
                  ? '代表にした語が今の候補にありません。①② で選び直してください'
                  : repState === 'held'
                    ? '押すと今の代表で確定します'
                    : repState === 'open'
                      ? '候補の ①② を押すと代表に決まります'
                      : '①② を押すと代表を変更・解除できます'
              }
              onClick={() =>
                send(
                  { op: 'rep', picks, confirmed: true },
                  '代表を確定しました'
                )
              }
            >
              {REP_STATUS_LABEL[repState]}
            </button>
            {REP_RANKS.map((rank) => {
              const pick = picks[rank - 1]
              const live = pick && livePicks(doc).includes(pick)
              return (
                <span
                  key={rank}
                  class={
                    'nd-rep-pick' +
                    (pick ? '' : ' none') +
                    (pick && !live ? ' gone' : '')
                  }
                  title={pick && !live ? '今の候補に無い語' : undefined}
                >
                  {REP_LABEL[rank]}{' '}
                  {pick ? parseWord(pick.w).base || pick.w : '—'}
                </span>
              )
            })}
          </section>
          {/* 追加と保存を 1 行にまとめる。未保存バーを別の行で出し入れすると、
              dock の高さが変わって画面全体が上下に揺れる */}
          <div class="nd-editrow">
            <button
              class="nd-add"
              onClick={() => addRow('wh')}
              disabled={!nextFreeSlot(rows, 'wh')}
            >
              ＋ 人
            </button>
            <button
              class="nd-add"
              onClick={() => addRow('wm')}
              disabled={!nextFreeSlot(rows, 'wm')}
            >
              ＋ 物
            </button>
            {dirty ? (
              <>
                <span
                  class="nd-dirty"
                  role="status"
                  aria-label={`未保存の変更 ${changed.length} 件`}
                >
                  ● 未保存 {changed.length}
                </span>
                <button class="nd-ghost" onClick={() => setDrafts({})}>
                  戻す
                </button>
                <button
                  class="nd-save"
                  onClick={() => saveSlots(rows, '保存しました')}
                >
                  保存
                </button>
              </>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  )

  return <Screen main={main} dock={dock} />
}

function SlotCard({
  token,
  row,
  slotWord,
  index,
  num,
  tables,
  knownTags,
  moveOpen,
  onToggleMove,
  onMove,
  focused,
  repMark,
  rateMark,
  isSaved,
  changed,
  dragging,
  onDragStart,
  onDragEnd,
  onDropAt,
  onEdit,
  onDelete,
  onPickRep,
  onRate,
}: {
  /** 画像のピッカーを開く通行証 */
  token: string
  /** カード 1 枚の行。タグ違いで分けたカードは variant と «本体#タグ 1 つ» の語を持つ */
  row: SlotRow
  /** カードの元の枠の語 (美咲#bang#ml)。書き換えはこの語に当てる */
  slotWord: string
  index: number
  /** この画面の番号。かながその読みになっているかを見る */
  num: string
  tables: ReadingTables | null
  knownTags: TagSuggestion[]
  moveOpen: boolean
  onToggleMove: () => void
  onMove: (to: string) => void
  focused: boolean
  /** 保存の状態 (黄 = 保存待ち / 緑 = 保存済み / 赤 = 失敗)。押せなくはしない */
  repMark?: SaveMark
  rateMark?: SaveMark
  /** サーバに保存済みの枠か。追加しただけの候補は代表・評価の対象にできない */
  isSaved: boolean
  /** 保存済みの内容から書き換えた (または新しく足した) 枠 */
  changed: boolean
  dragging: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDropAt: () => void
  onEdit: (patch: Partial<SlotRow>) => void
  onDelete: () => void
  onPickRep: (rank: 1 | 2) => void
  onRate: (value: number) => void
}) {
  // 書き換え中・足しただけの枠は、代表と評価を付ける相手 (保存された語) と
  // 画面の語がずれている。押せない飾りを並べず、保存が先だと書く
  const pending = !isSaved || changed
  // 入力中もその場で判定する。打ったかながどの番号の読みかが分かる
  const check: ReadingCheck | null = tables
    ? checkReading(tables, row.kana, num)
    : null
  const suspicious =
    check?.status === 'mismatch' || check?.status === 'unreadable'
  // タグ違いのカードは枠ごと移すと他のタグの語まで動くので、ここからは移さない
  const canMove = !pending && !row.variant
  // 選び直した画像は配信データにまだ無いので、詳細の語の行と同じく override で見せる。
  // タグ違いのカードは «旧スロット#タグ» の枠の画像 (枠の画像とは別物)
  const imageSlot = imageSlotOf(row.slot, row.variant)
  const picked = useImageOverride(num, imageSlot)
  const [isPicking, setIsPicking] = useState(false)
  // 保存していない枠は画像の対象 (DB の語) に無いので選べない
  const canPickImage = Boolean(token && isSaved && row.word)
  const imageUrl = picked?.url ?? row.imageUrl
  // 選び直した画像は今の語で選んだもの
  const isStale = !picked && row.imageStale
  return (
    <li
      class={
        'nd-card' +
        (row.repRank && !pending ? ' rep' : '') +
        (pending ? ' draft' : '') +
        (dragging ? ' dragging' : '')
      }
      onDragOver={(event) => event.preventDefault()}
      onDrop={onDropAt}
    >
      <div class="nd-card-head">
        {/* ハンドルだけ draggable。カード全体だと入力欄を選択できなくなる */}
        <span
          class="nd-handle"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title="ドラッグで優先順位を変える"
        >
          ⠿
        </span>
        <span class="nd-slot">
          {row.slot}
          {pending ? (
            <span class="nd-draft-tag">{isSaved ? '未保存' : '新規'}</span>
          ) : null}
          {/* 読みルールで別の番号になるかなは目印を出す。押すと移動欄を開く */}
          {suspicious ? (
            <button
              class="nd-read-warn"
              disabled={!canMove}
              onClick={onToggleMove}
              title={
                check?.status === 'mismatch'
                  ? `読みルールでは ${check.suggest[0]}`
                  : '読みルールに無いかなを含む'
              }
            >
              ⚠{check?.status === 'mismatch' ? check.suggest[0] : '?'}
            </button>
          ) : null}
        </span>
        {/* サムネを押すと画像のピッカー (A-1)。右下の ✎ で押せると分かるようにする */}
        <button
          type="button"
          class="nd-img-btn"
          disabled={!canPickImage}
          onClick={() => setIsPicking(true)}
          aria-label={`${row.word} の画像を選び直す`}
          title={
            canPickImage
              ? isStale
                ? '確定時点の語と違う画像 (押すと選び直す)'
                : '画像を選び直す'
              : '保存すると画像を選べます'
          }
        >
          {imageUrl ? (
            <img
              class={'nd-img' + (isStale ? ' stale' : '')}
              loading="lazy"
              {...wordImage(imageUrl, 40, row.word)}
              alt={row.word}
            />
          ) : (
            <span class="nd-img empty" />
          )}
          {canPickImage ? (
            <span class="nd-img-badge" aria-hidden="true">
              ✎
            </span>
          ) : null}
        </button>
        {isPicking ? (
          <ImagePickerSheet
            token={token}
            id={num}
            slot={imageSlot}
            word={row.word}
            current={picked ?? (imageUrl ? { url: imageUrl, hash: '' } : null)}
            onClose={() => setIsPicking(false)}
          />
        ) : null}
        <div class="nd-fields">
          <input
            class="nd-input"
            value={baseText(row.word)}
            placeholder="語"
            autoFocus={focused}
            onInput={(event) =>
              onEdit({ word: setBase(slotWord, event.currentTarget.value) })
            }
          />
          <input
            class="nd-input kana"
            value={row.kana}
            placeholder="よみ"
            onInput={(event) => onEdit({ kana: event.currentTarget.value })}
          />
        </div>
        <button
          class={'nd-del nd-move-btn' + (moveOpen ? ' on' : '')}
          disabled={!canMove}
          onClick={onToggleMove}
          aria-expanded={moveOpen}
          title={
            row.variant
              ? 'タグ違いの語は移せません (枠ごと移すと他のタグの語も動く)'
              : pending
                ? '保存してから移せます'
                : '別の番号へ移す'
          }
        >
          ⇄
        </button>
        <button
          class="nd-del"
          onClick={onDelete}
          title={
            row.variant ? `#${row.variant} の語だけ外す` : 'この候補を削除'
          }
        >
          ×
        </button>
      </div>
      <TagRow
        word={row.word}
        lockedTag={row.variant}
        knownTags={knownTags}
        onApply={(change) => onEdit({ word: change(slotWord) })}
      />
      {moveOpen ? (
        <MovePanel
          num={num}
          kana={row.kana}
          tables={tables}
          onMove={onMove}
          onCancel={onToggleMove}
        />
      ) : null}

      <div class="nd-card-foot">
        {row.rankey && !pending ? <Rankey value={row.rankey} /> : null}
        {row.pt != null && !pending ? (
          <span class="nd-pt">{row.pt.toFixed(1)}</span>
        ) : null}
        {pending ? (
          <span class="nd-pending-note">
            保存すると代表・評価を付けられます
          </span>
        ) : (
          <>
            <div
              class={
                'nd-rank-group' + saveClass(row.repRank ? repMark : undefined)
              }
              role="group"
              aria-label="代表"
            >
              {REP_RANKS.map((rank) => (
                <button
                  key={rank}
                  class={'nd-rank' + (row.repRank === rank ? ' on' : '')}
                  disabled={!row.word}
                  aria-pressed={row.repRank === rank}
                  onClick={() => onPickRep(rank)}
                  title={`代表${REP_LABEL[rank]}にする / 外す`}
                >
                  {REP_LABEL[rank]}
                </button>
              ))}
            </div>
            <div class={'nd-rate' + saveClass(rateMark)}>
              {RATING_VALUES.map((value) => (
                <button
                  key={value}
                  class={'nd-rate-btn' + (row.rating === value ? ' on' : '')}
                  disabled={!row.word}
                  onClick={() => onRate(value)}
                >
                  {RATING_LABEL[value]}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </li>
  )
}

/**
 * 別の番号へ移す欄。読みルールで読んだ番号 (と中間省略で読める番号) を候補に出し、
 * 押せばその番号が入る。手で打ってもよい
 */
function MovePanel({
  num,
  kana,
  tables,
  onMove,
  onCancel,
}: {
  num: string
  kana: string
  tables: ReadingTables | null
  onMove: (to: string) => void
  onCancel: () => void
}) {
  const reading = tables ? readingOf(tables, kana) : { num: null, omitted: [] }
  const suggestions = [
    ...(reading.num ? [{ num: reading.num, label: '読み' }] : []),
    ...reading.omitted.map((n) => ({ num: n, label: '省略' })),
  ].filter((item) => item.num !== num)
  const [to, setTo] = useState(suggestions[0]?.num ?? '')
  const valid = /^\d{3}$/.test(to) && to !== num

  return (
    <div class="nd-move" role="group" aria-label="別の番号へ移す">
      <div class="nd-move-row">
        <span class="nd-move-label">移動先</span>
        <input
          class="nd-move-input"
          inputMode="numeric"
          pattern="[0-9]*"
          maxLength={3}
          value={to}
          onInput={(event) =>
            setTo(event.currentTarget.value.replace(/\D/g, '').slice(0, 3))
          }
        />
        <button class="nd-save" disabled={!valid} onClick={() => onMove(to)}>
          移す
        </button>
        <button class="nd-ghost" onClick={onCancel}>
          やめる
        </button>
      </div>
      {suggestions.length ? (
        <div class="nd-move-row">
          <span class="nd-move-label">候補</span>
          {suggestions.map((item) => (
            <button
              key={item.num}
              class={'nd-move-chip' + (to === item.num ? ' on' : '')}
              onClick={() => setTo(item.num)}
            >
              {item.num}
              <small>{item.label}</small>
            </button>
          ))}
        </div>
      ) : (
        <p class="nd-move-note">
          {reading.num === num
            ? 'このかなはこの番号の読みです'
            : '読みルールから番号を出せないかなです'}
        </p>
      )}
    </div>
  )
}

/**
 * 語の文字列 («本体#タグ -ラベル») を分けて見せる行。テキスト欄で直接書いても、
 * ここで付け外ししても同じ語の文字列を書き換える (保存は他の編集と同じ «保存»)。
 * 行は常に出す。タグの有無で出し入れするとカードの高さが変わって画面が揺れる
 */
function TagRow({
  word,
  lockedTag,
  knownTags,
  onApply,
}: {
  /** 見せる語。タグ違いのカードでは «本体#そのタグ» */
  word: string
  /** タグ違いのカードの出典タグ。外すとカードそのものが消えるので × を出さない */
  lockedTag?: string
  knownTags: TagSuggestion[]
  /** 書き換えを枠の語に当てる (分けたカードでも枠の語全体に効く) */
  onApply: (change: (word: string) => string) => void
}) {
  const names = useTagNames()
  const [adding, setAdding] = useState(false)
  const [query, setQuery] = useState('')
  const parsed = parseWord(word)
  const suggestions = adding ? suggestTags(knownTags, query, parsed.tags) : []
  const meaning = (id: string) =>
    LABELS.find((label) => label.id === id)?.meaning ?? ''

  const commit = (tag: string) => {
    onApply((current) => addTag(current, tag))
    setQuery('')
  }

  return (
    <div class="nd-tags">
      <div class="nd-tag-row">
        {word && !parsed.base ? (
          <span
            class="nd-tag warn"
            title="本体の無い語。シートの «語#a,#b» の 2 つ目以降"
          >
            本体なし
          </span>
        ) : null}
        {parsed.tags.map((tag) => (
          <span key={'t' + tag} class="nd-tag" title={`#${tag}`}>
            {tagNameOf(tag, names)}
            {tag === lockedTag ? null : (
              <button
                class="nd-tag-x"
                aria-label={`タグ ${tag} を外す`}
                onClick={() => onApply((current) => removeTag(current, tag))}
              >
                ×
              </button>
            )}
          </span>
        ))}
        {parsed.labels.map((label) => (
          <span key={'l' + label} class="nd-tag label" title={meaning(label)}>
            -{label}
            <small>{meaning(label)}</small>
            <button
              class="nd-tag-x"
              aria-label={`ラベル ${label} を外す`}
              onClick={() => onApply((current) => removeLabel(current, label))}
            >
              ×
            </button>
          </span>
        ))}
        <button
          class={'nd-tag-add' + (adding ? ' on' : '')}
          aria-expanded={adding}
          onClick={() => setAdding((prev) => !prev)}
        >
          {adding ? '閉じる' : '＋ タグ'}
        </button>
      </div>
      {adding ? (
        <div class="nd-tag-picker">
          <input
            class="nd-tag-input"
            placeholder="タグか作品名で検索 (Enter で追加)"
            value={query}
            onInput={(event) => setQuery(event.currentTarget.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.isComposing) {
                event.preventDefault()
                commit(query)
              }
            }}
          />
          <div class="nd-tag-row">
            {suggestions.map((item) => (
              <button
                key={item.tag}
                class="nd-tag-cand"
                onClick={() => commit(item.tag)}
              >
                #{item.tag}
                {item.name && item.name !== item.tag ? (
                  <span class="nd-tag-name">{item.name}</span>
                ) : null}
                <small>{item.count}</small>
              </button>
            ))}
            {query.trim() &&
            !suggestions.some((item) => item.tag === query.trim()) ? (
              <button class="nd-tag-cand new" onClick={() => commit(query)}>
                ＋ #{query.trim().replace(/^#+/, '')}
              </button>
            ) : null}
          </div>
          <div class="nd-tag-row">
            <span class="nd-move-label">ラベル</span>
            {LABELS.map((label) => {
              const on = parsed.labels.includes(label.id)
              // 引退したラベル (-n → 評価 -1) は付いている語でだけ出す (外す用)
              if (label.retired && !on) return null
              return (
                <button
                  key={label.id}
                  class={'nd-tag-cand' + (on ? ' on' : '')}
                  aria-pressed={on}
                  title={label.meaning}
                  onClick={() =>
                    onApply((current) =>
                      on
                        ? removeLabel(current, label.id)
                        : addLabel(current, label.id)
                    )
                  }
                >
                  -{label.id}
                  <small>{label.meaning}</small>
                </button>
              )
            })}
          </div>
        </div>
      ) : null}
    </div>
  )
}
