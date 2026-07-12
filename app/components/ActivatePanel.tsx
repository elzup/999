import { ACTIVATE_URL } from '../data/constants'
import { loadEditorToken, clearEditorToken } from '../lib/editorAuth'

/**
 * 設定内「認証」節。このブラウザのアクティベート状態を表示し、
 * 個人 Notion (トークン URL 記載) へのリンクと解除を提供する。
 */
function ActivatePanel() {
  const token = loadEditorToken()
  const isActivated = Boolean(token)

  const deactivate = () => {
    if (!confirm('このブラウザのアクティベートを解除しますか？')) return
    clearEditorToken()
    window.location.reload()
  }

  return (
    <div class="content activate-panel">
      <div class="activate-status">
        状態:{' '}
        {isActivated ? (
          <b style={{ color: 'var(--accent)' }}>アクティベート済み</b>
        ) : (
          <b style={{ color: 'var(--warn)' }}>未アクティベート</b>
        )}
      </div>

      <p class="activate-desc">
        辞書・画像などの個人データは認証済みブラウザだけが取得できます。新しい端末では
        Notion (要ログイン) のアクティベートリンクを開き、トークン付き URL
        を踏んでください。
      </p>

      <a
        class="activate-link"
        href={ACTIVATE_URL}
        target="_blank"
        rel="noreferrer"
      >
        アクティベート (Notion を開く)
      </a>

      {isActivated && (
        <button class="activate-clear" onClick={deactivate}>
          このブラウザの認証を解除
        </button>
      )}
    </div>
  )
}

export default ActivatePanel
