import { useState, useCallback } from 'preact/hooks'
import { ACTIVATE_URL } from '../data/constants'
import { saveEditorToken } from '../lib/editorAuth'
import { isPasskeySupported, loginWithPasskey } from '../lib/passkeyApi'

type Props = {
  // token はあるが拒否された (無効/失効) 場合は true
  invalid?: boolean
}

/**
 * 未認証ブラウザ向けのロック画面。辞書データは認証付き API 経由でしか取得できないため、
 * ここではデータを一切表示しない。登録済みのパスキー、個人 Notion (ログイン必須) の
 * アクティベートリンク、手動トークン入力のいずれかで認証する。
 */
function LockedScreen({ invalid = false }: Props) {
  const [input, setInput] = useState('')
  const [isBusy, setIsBusy] = useState(false)
  const [error, setError] = useState('')
  const canUsePasskey = isPasskeySupported()

  const activate = useCallback(() => {
    const token = input.trim()
    if (!token) return
    saveEditorToken(token)
    window.location.reload()
  }, [input])

  const passkeyLogin = useCallback(async () => {
    setIsBusy(true)
    setError('')
    try {
      await loginWithPasskey()
      window.location.reload()
    } catch (e) {
      setError((e as Error).message)
      setIsBusy(false)
    }
  }, [])

  return (
    <div class="locked-screen">
      <div class="locked-card">
        <div class="locked-title">🔒 999</div>
        <p class="locked-desc">
          {invalid
            ? '認証が無効か期限切れです。もう一度ログインしてください。'
            : 'このブラウザは未認証です。辞書データを表示するにはログインが必要です。'}
        </p>

        <div class="locked-manual">
          <div class="locked-manual-label">トークンを直接入力</div>
          <div class="locked-manual-row">
            <input
              class="locked-input"
              type="password"
              value={input}
              placeholder="access token"
              onInput={(e) => setInput((e.target as HTMLInputElement).value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') activate()
              }}
            />
            <button
              class="locked-btn"
              onClick={activate}
              disabled={!input.trim()}
            >
              認証
            </button>
          </div>
        </div>

        {/* 一番よく使う «パスキーでログイン» を最下段 (親指側) に置く */}
        <div class="locked-actions">
          <a
            class="locked-activate"
            href={ACTIVATE_URL}
            target="_blank"
            rel="noreferrer"
          >
            アクティベート (Notion)
          </a>
          {canUsePasskey ? (
            <button
              class="locked-passkey"
              onClick={passkeyLogin}
              disabled={isBusy}
            >
              {isBusy ? '認証中…' : 'パスキーでログイン'}
            </button>
          ) : null}
          {error ? <p class="locked-error">{error}</p> : null}
        </div>
      </div>
    </div>
  )
}

export default LockedScreen
