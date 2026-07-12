import { useState, useCallback } from 'preact/hooks'
import { ACTIVATE_URL } from '../data/constants'
import { saveEditorToken } from '../lib/editorAuth'

type Props = {
  // token はあるが拒否された (無効/失効) 場合は true
  invalid?: boolean
}

/**
 * 未認証ブラウザ向けのロック画面。辞書データは認証付き API 経由でしか取得できないため、
 * ここではデータを一切表示しない。個人 Notion (ログイン必須) のアクティベートリンク、
 * または手動トークン入力で認証する。
 */
function LockedScreen({ invalid = false }: Props) {
  const [input, setInput] = useState('')

  const activate = useCallback(() => {
    const token = input.trim()
    if (!token) return
    saveEditorToken(token)
    window.location.reload()
  }, [input])

  return (
    <div class="locked-screen">
      <div class="locked-card">
        <div class="locked-title">🔒 999</div>
        <p class="locked-desc">
          {invalid
            ? 'トークンが無効か失効しています。再アクティベートしてください。'
            : 'このブラウザは未アクティベートです。辞書データを表示するにはアクティベートが必要です。'}
        </p>

        <a
          class="locked-activate"
          href={ACTIVATE_URL}
          target="_blank"
          rel="noreferrer"
        >
          アクティベート
        </a>

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
      </div>
    </div>
  )
}

export default LockedScreen
