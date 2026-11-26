// カードの語を直すフォーム (正本は DB。D-0174: スプレッドシートの代わり)
import { useState } from 'preact/hooks'
import type { CardEntry } from '../data/schema'
import { patchCard, type CardPatch } from '../lib/cardApi'
import { loadEditorToken } from '../lib/editorAuth'

type Field = keyof CardPatch
const FIELDS: [Field, string][] = [
  ['person', '人'],
  ['actionP', '人の行動'],
  ['object', '物'],
  ['actionO', '物の行動'],
  ['action', '行動'],
]

type Props = { c: CardEntry; onDone: () => void }

function CardEditForm({ c, onDone }: Props) {
  const [values, setValues] = useState<CardPatch>(() =>
    Object.fromEntries(FIELDS.map(([f]) => [f, c[f] ?? '']))
  )
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  const changed = FIELDS.filter(([f]) => (values[f] ?? '') !== (c[f] ?? ''))

  const save = async () => {
    const token = loadEditorToken()
    if (!token) {
      setStatus('保存には認証が要ります (設定 > 認証)')
      return
    }
    setSaving(true)
    setStatus('')
    try {
      await patchCard(
        c.suit + c.rank,
        Object.fromEntries(changed.map(([f]) => [f, values[f] ?? ''])),
        token
      )
      onDone()
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return (
    <form
      class="card-edit"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      {FIELDS.map(([field, label]) => (
        <label class="card-edit-row" key={field}>
          <span class="card-edit-label">{label}</span>
          <input
            id={`card-edit-${field}`}
            value={values[field] ?? ''}
            onInput={(event) =>
              setValues({
                ...values,
                [field]: (event.target as HTMLInputElement).value,
              })
            }
          />
        </label>
      ))}
      {status ? <div class="card-edit-status">{status}</div> : null}
      <div class="card-edit-actions">
        <button type="button" onClick={onDone} disabled={saving}>
          やめる
        </button>
        <button type="submit" disabled={saving || changed.length === 0}>
          {saving ? '保存中…' : '保存'}
        </button>
      </div>
    </form>
  )
}

export default CardEditForm
