// タグの名前 (正式名・略称) を直すフォーム (正本は DB。D-0174: スプレッドシートの tags タブの代わり)
import { useContext, useState } from 'preact/hooks'
import { loadEditorToken } from '../lib/editorAuth'
import { patchTagName } from '../lib/tagApi'
import { TagTitlesContext, useTagNames } from '../lib/tagNames'

/** 1 つのタグの正式名・略称の下書きと保存。フォームと表の行で同じものを使う */
export function useTagNameDraft(tag: string) {
  const titles = useContext(TagTitlesContext)
  const names = useTagNames()
  const title0 = titles[tag] ?? ''
  // 表示名は «略称 → 正式名»。正式名と同じなら略称は無い
  const short0 = names[tag] && names[tag] !== title0 ? names[tag] : ''
  const [title, setTitle] = useState(title0)
  const [short, setShort] = useState(short0)
  const [status, setStatus] = useState('')
  const [saving, setSaving] = useState(false)
  // 保存した値を基準にする (配信データは次のビルドまで古いまま)
  const [saved, setSaved] = useState({ title: title0, short: short0 })
  const changed = title !== saved.title || short !== saved.short

  const save = async () => {
    const token = loadEditorToken()
    if (!token) {
      setStatus('保存には認証が要ります (設定 > 認証)')
      return
    }
    setSaving(true)
    setStatus('')
    try {
      await patchTagName({ tag, title, short }, token)
      setSaved({ title, short })
      setStatus('保存しました')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    } finally {
      setSaving(false)
    }
  }

  return { title, setTitle, short, setShort, status, saving, changed, save }
}

function TagNameForm({ tag }: { tag: string }) {
  const draft = useTagNameDraft(tag)
  return (
    <form
      class="card-edit"
      key={tag}
      onSubmit={(event) => {
        event.preventDefault()
        draft.save()
      }}
    >
      <label class="card-edit-row">
        <span class="card-edit-label">正式名</span>
        <input
          id="tag-edit-title"
          value={draft.title}
          onInput={(e) => draft.setTitle((e.target as HTMLInputElement).value)}
        />
      </label>
      <label class="card-edit-row">
        <span class="card-edit-label">略称</span>
        <input
          id="tag-edit-short"
          value={draft.short}
          onInput={(e) => draft.setShort((e.target as HTMLInputElement).value)}
        />
      </label>
      {draft.status ? <div class="card-edit-status">{draft.status}</div> : null}
      <div class="card-edit-actions">
        <button type="submit" disabled={draft.saving || !draft.changed}>
          {draft.saving ? '保存中…' : '保存'}
        </button>
      </div>
    </form>
  )
}

export default TagNameForm
