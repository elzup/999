// 代表語ピッカー。代表語コンソール (console/rep.html) のスマホ版で、百の位ごとの
// 一覧から番号の代表 ①② を選んでいく。選んだ時点で確定する (コンソールと同じ)。
//
// 行は人 / 物の 2 段に候補チップを並べ、チップの左に画像を出す (D-0030)。
// dock は 絞り込み / 百の位 / 十の位ジャンプ (D-0029)。
import { useCallback, useEffect, useMemo, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { loadSubTab, saveSubTab } from '../data/storage'
import { fetchHundred, patchNumber, type NumberDoc } from '../lib/numberApi'
import {
  slotRows,
  withDeliveredImages,
  type SlotRow,
} from '../lib/numberDetail'
import { useNumberContext } from '../lib/numberContext'
import {
  decadeProgress,
  isStale,
  matchesFilter,
  REP_FILTERS,
  togglePick,
  type RepFilter,
} from '../lib/repPicker'
import Screen, { DockBar, DockRow } from './Screen'

const HUNDRED_KEY = 'rep.hundred'
const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']
const MARK = ['', '①', '②']

type Props = {
  token: string
  numbers: NumberEntry[]
}

function PickChip({
  row,
  disabled,
  onPick,
}: {
  row: SlotRow
  disabled: boolean
  onPick: () => void
}) {
  return (
    <button
      class={
        'rp-chip ' +
        (row.slot.startsWith('wh') ? 'is-hito' : 'is-mono') +
        (row.repRank ? ' is-rank' + row.repRank : '')
      }
      disabled={disabled}
      aria-pressed={row.repRank > 0}
      onClick={onPick}
    >
      {row.imageUrl ? (
        <img class="rp-thumb" src={row.imageUrl} alt="" loading="lazy" />
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
  saving,
  onPick,
  onOpen,
}: {
  doc: NumberDoc
  entry: NumberEntry | undefined
  saving: boolean
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
      class={'rp-row' + (doc.rep?.confirmed ? ' is-done' : '')}
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
                  disabled={saving}
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
  const [docs, setDocs] = useState<NumberDoc[]>([])
  const [filter, setFilter] = useState<RepFilter>('all')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState<string | null>(null)
  const [status, setStatus] = useState('')

  useEffect(() => {
    if (!token) return
    setLoading(true)
    setStatus('')
    fetchHundred(Number(hundred), token)
      .then((list) => setDocs(list.sort((a, b) => a.num.localeCompare(b.num))))
      .catch((error) => setStatus(String(error.message)))
      .finally(() => setLoading(false))
  }, [hundred, token])

  const entries = useMemo(
    () => new Map(numbers.map((entry) => [entry.num, entry])),
    [numbers]
  )
  const visible = docs.filter((doc) => matchesFilter(doc, filter))
  const progress = decadeProgress(docs)
  const doneCount = docs.filter((doc) => doc.rep?.confirmed).length

  const pick = useCallback(
    async (doc: NumberDoc, slot: string) => {
      if (saving) return
      const picks = togglePick(doc, slot)
      setSaving(doc.num)
      setStatus('')
      try {
        const saved = await patchNumber({
          num: doc.num,
          token,
          op: { op: 'rep', picks, confirmed: picks.length > 0 },
          // 読んだ時点を添える。他の面が先に書いていればサーバが 409 で止める
          expectedUpdatedAt: doc.updatedAt ?? null,
        })
        setDocs((prev) => prev.map((d) => (d.num === saved.num ? saved : d)))
      } catch (error) {
        setStatus(`${doc.num}: ${(error as Error).message}`)
      } finally {
        setSaving(null)
      }
    },
    [saving, token]
  )

  const chooseHundred = (next: string) => {
    saveSubTab(HUNDRED_KEY, next)
    setHundred(next)
  }

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

  const main = visible.length ? (
    <ul class="rp-list stack-up" style={{ '--stack-gap': '4px' }}>
      {visible.map((doc) => (
        <RepRow
          key={doc.num}
          doc={doc}
          entry={entries.get(doc.num)}
          saving={saving !== null}
          onPick={(slot) => pick(doc, slot)}
          onOpen={ctx ? () => ctx.openEditor(doc.num) : undefined}
        />
      ))}
    </ul>
  ) : (
    <div class="screen-empty">{loading ? '読み込み中…' : '該当なし'}</div>
  )

  const dock = (
    <>
      {status ? <div class="rp-status">{status}</div> : null}
      <DockBar
        title="代表"
        sub={`${doneCount}/${docs.length} 確定 · ${hundred}00-${hundred}99`}
      />
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
