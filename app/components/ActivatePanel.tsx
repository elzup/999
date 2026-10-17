import { useCallback, useEffect, useState } from 'preact/hooks'
import { ACTIVATE_URL } from '../data/constants'
import { loadEditorToken, clearEditorToken } from '../lib/editorAuth'
import {
  deletePasskey,
  guessDeviceName,
  isPasskeySupported,
  isSessionToken,
  listPasskeys,
  registerPasskey,
  type PasskeyItem,
} from '../lib/passkeyApi'

function formatDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return '-'
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

/**
 * 設定内「認証」節。このブラウザの認証状態、パスキーの登録と端末一覧、
 * 個人 Notion (トークン URL 記載) へのリンクと解除を提供する。
 */
function ActivatePanel() {
  const token = loadEditorToken()
  const isActivated = Boolean(token)
  const isSession = isSessionToken(token)
  const [passkeys, setPasskeys] = useState<PasskeyItem[] | null>(null)
  const [name, setName] = useState(guessDeviceName)
  const [isBusy, setIsBusy] = useState(false)
  const [message, setMessage] = useState('')

  const reload = useCallback(() => {
    if (!isActivated) return
    listPasskeys(token)
      .then(setPasskeys)
      .catch((e: Error) => setMessage(e.message))
  }, [isActivated, token])

  useEffect(reload, [reload])

  const register = async () => {
    setIsBusy(true)
    setMessage('')
    try {
      await registerPasskey(name.trim())
      // 保存値が通行証に替わったので、画面ごと読み直して以後の API に使わせる
      window.location.reload()
    } catch (e) {
      setMessage((e as Error).message)
      setIsBusy(false)
    }
  }

  const remove = async (item: PasskeyItem) => {
    const warning = item.isCurrent
      ? '今この端末が使っているパスキーです。消すとこの端末はログアウトします。'
      : ''
    if (!confirm(`${warning}「${item.name}」を削除しますか？`)) return
    try {
      await deletePasskey(token, item.id)
      if (item.isCurrent) {
        clearEditorToken()
        window.location.reload()
        return
      }
      reload()
    } catch (e) {
      setMessage((e as Error).message)
    }
  }

  const deactivate = () => {
    if (!confirm('このブラウザのアクティベートを解除しますか？')) return
    clearEditorToken()
    window.location.reload()
  }

  return (
    <div class="activate-panel">
      <div class="activate-status">
        状態:{' '}
        {!isActivated ? (
          <b style={{ color: 'var(--warn)' }}>未アクティベート</b>
        ) : isSession ? (
          <b style={{ color: 'var(--accent)' }}>パスキーでログイン中</b>
        ) : (
          <b style={{ color: 'var(--accent)' }}>トークンで認証中</b>
        )}
      </div>

      <p class="activate-desc">
        辞書・画像などの個人データは認証済みブラウザだけが取得できます。新しい端末では
        Notion (要ログイン) のアクティベートリンクを開き、トークン付き URL
        を踏んでからパスキーを登録してください。以後はパスキーだけでログインできます。
      </p>

      {passkeys ? (
        <div class="passkey-list">
          <div class="section-label">登録済みのパスキー</div>
          {passkeys.length === 0 ? (
            <div class="passkey-empty">まだありません</div>
          ) : (
            passkeys.map((item) => (
              <div key={item.id} class="passkey-item">
                <div class="passkey-text">
                  <span class="passkey-name">
                    {item.name}
                    {item.isCurrent ? (
                      <span class="passkey-current">この端末</span>
                    ) : null}
                  </span>
                  <span class="passkey-meta">
                    最終利用 {formatDate(item.lastUsedAt)}
                    {item.backedUp ? ' ・ 同期あり' : ''}
                  </span>
                </div>
                <button class="passkey-delete" onClick={() => remove(item)}>
                  削除
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}

      {isActivated && !isSession && isPasskeySupported() ? (
        <div class="passkey-register">
          <div class="section-label">この端末のパスキーを登録</div>
          <div class="locked-manual-row">
            <input
              class="locked-input"
              value={name}
              maxLength={40}
              aria-label="端末の名前"
              onInput={(e) => setName((e.target as HTMLInputElement).value)}
            />
            <button class="locked-passkey" onClick={register} disabled={isBusy}>
              {isBusy ? '登録中…' : '登録'}
            </button>
          </div>
        </div>
      ) : null}

      {message ? <p class="locked-error">{message}</p> : null}

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
