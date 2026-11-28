// タグの表: 1 タグ 1 行で キー・正式名・略称・語数 を並べ、その場で直す (QA-0117 h)。
// シートの tags タブで «ほかのタグの名付けを見比べながら書けた» のを画面でもできるようにする
import { h } from 'preact'
import type { TagRow } from './TagFilterTab'
import { useTagNameDraft } from './TagNameForm'

type Props = {
  rows: TagRow[]
  /** 名前を直せないグループ (属性・ラベル。名前はコードの定数) */
  isReadOnly: (tag: string) => boolean
  onPick: (tag: string) => void
}

function TagTable({ rows, isReadOnly, onPick }: Props) {
  if (rows.length === 0)
    return <div class="screen-empty">該当するタグがありません</div>
  return (
    <table class="tt">
      <thead>
        <tr>
          <th>キー</th>
          <th>正式名</th>
          <th>略称</th>
          <th class="tt-num">語</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {rows.map((row) =>
          isReadOnly(row.tag) ? (
            <tr key={row.tag} class="tt-fixed">
              <td class="tt-key">{row.tag}</td>
              <td colSpan={2}>{row.title}</td>
              <td class="tt-num">
                <button class="tt-count" onClick={() => onPick(row.tag)}>
                  {row.count}
                </button>
              </td>
              <td />
            </tr>
          ) : (
            <EditableRow key={row.tag} row={row} onPick={onPick} />
          )
        )}
      </tbody>
    </table>
  )
}

function EditableRow({
  row,
  onPick,
}: {
  row: TagRow
  onPick: (tag: string) => void
}) {
  const draft = useTagNameDraft(row.tag)
  const isError = draft.status !== '' && draft.status !== '保存しました'
  return (
    <tr>
      <td class="tt-key">{row.tag}</td>
      <td>
        <input
          class="tt-input"
          aria-label={`${row.tag} の正式名`}
          value={draft.title}
          onInput={(e) => draft.setTitle((e.target as HTMLInputElement).value)}
        />
      </td>
      <td>
        <input
          class="tt-input tt-input--short"
          aria-label={`${row.tag} の略称`}
          value={draft.short}
          onInput={(e) => draft.setShort((e.target as HTMLInputElement).value)}
        />
      </td>
      <td class="tt-num">
        <button class="tt-count" onClick={() => onPick(row.tag)}>
          {row.count}
        </button>
      </td>
      <td class="tt-act">
        {draft.changed ? (
          <button
            class="tt-save"
            disabled={draft.saving}
            onClick={() => draft.save()}
          >
            {draft.saving ? '…' : '保存'}
          </button>
        ) : null}
        {/* 失敗の理由 (認証が無い等)。スマホでは title が見えないので文字で出す */}
        {isError ? (
          <span class="tt-error" role="alert">
            {draft.status}
          </span>
        ) : null}
      </td>
    </tr>
  )
}

export default TagTable
