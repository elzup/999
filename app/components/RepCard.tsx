// 代表タブの «カード» 表示の 1 枚。詳細カード (NumDetailPanel) と同じ見た目で、
// 候補を全部 (人 wh1〜3 / 物 wm1〜3) 縦に並べ、語の行をタップして ①② を選ぶ。
// 選んだ時点で確定する (行表示のチップと同じ «選ぶ = 確定»)。
//
// 代表がまだ無い番号は、«確定» で入る既定 (① 人の 1 番手 ② 物の 1 番手) を
// 薄い ①② で先に見せる。押す前に何が確定されるか分かるように。
import { h } from 'preact'
import type { NumberEntry } from '../data/schema'
import type { NumberDoc } from '../lib/numberApi'
import {
  REP_STATUS_LABEL,
  repStatus,
  slotRows,
  withDeliveredImages,
} from '../lib/numberDetail'
import { confirmOp, defaultPickSlots } from '../lib/repPicker'
import Rankey from './Rankey'
import TaggedWord from './TaggedWord'
import { IconEdit } from './Icons'

const MARK = ['', '①', '②']

type Props = {
  doc: NumberDoc
  entry: NumberEntry | undefined
  saving: boolean
  onPick: (slot: string) => void
  onConfirm: () => void
  onOpen?: () => void
}

function RepCard({ doc, entry, saving, onPick, onConfirm, onOpen }: Props) {
  const status = repStatus(doc)
  const rows = withDeliveredImages(slotRows(doc), entry)
  const hasPicks = rows.some((row) => row.repRank > 0)
  // 代表が空なら、確定で入る既定の枠を薄く見せる
  const ghost = hasPicks ? [] : defaultPickSlots(doc)
  const canConfirm = confirmOp(doc) !== null

  return (
    <div class={'detail-panel rep-card ' + status} data-num={doc.num}>
      <div class="detail-row1">
        <div class="detail-idcol">
          <span class="detail-id">{doc.num}</span>
          <span class={'detail-rep ' + status}>{REP_STATUS_LABEL[status]}</span>
        </div>
        <div class="word-list">
          {rows.map((row) => {
            const kind = row.slot.startsWith('wm') ? 'kind-m' : 'kind-h'
            const ghostRank = ghost.indexOf(row.slot) + 1
            return (
              <button
                key={row.slot}
                class={'word-line rep-line open ' + kind}
                disabled={saving}
                aria-pressed={row.repRank > 0}
                onClick={() => onPick(row.slot)}
              >
                <span class="wl-kind">{kind === 'kind-m' ? '物' : '人'}</span>
                {row.imageUrl ? (
                  <img
                    class="wl-img"
                    src={row.imageUrl}
                    alt=""
                    loading="lazy"
                  />
                ) : (
                  <span class="wl-img empty" />
                )}
                {/* 代表を選ぶ場面なので、ヨミは最初から見せる */}
                <span class="detail-main-word">
                  <span class="yomi-host">
                    <TaggedWord word={row.word} />
                    <span class="yomi">{row.kana}</span>
                  </span>
                </span>
                {row.repRank ? (
                  <span class={'wl-rep ' + status}>{MARK[row.repRank]}</span>
                ) : ghostRank ? (
                  <span class="wl-rep ghost" title="確定で入る既定">
                    {MARK[ghostRank]}
                  </span>
                ) : null}
                {row.rankey ? (
                  <span class="wl-meta">
                    <Rankey value={row.rankey} />
                  </span>
                ) : null}
              </button>
            )
          })}
        </div>
      </div>
      <div class="detail-foot-actions">
        {status === 'stale' ? (
          <span class="rep-card-note">
            代表にした語が候補にありません。語をタップして選び直してください
          </span>
        ) : (
          <button
            class="detail-act act-confirm"
            disabled={!canConfirm || saving}
            onClick={onConfirm}
          >
            <span>
              {status === 'confirmed'
                ? '確定済み'
                : hasPicks
                  ? 'この代表で確定'
                  : '既定 (①②) で確定'}
            </span>
          </button>
        )}
        {onOpen ? (
          <button class="detail-act act-edit" onClick={onOpen}>
            <IconEdit />
            <span>編集</span>
          </button>
        ) : null}
      </div>
    </div>
  )
}

export default RepCard
