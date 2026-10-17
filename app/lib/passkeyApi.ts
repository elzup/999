// パスキーでのログインと端末管理。サーバ側は functions/passkey-route.js。
//
// 認証が通るとサーバが通行証 (ps1. で始まる) を返すので、合言葉の代わりに
// localStorage へ保存する。以後の API は今まで通り Bearer で送るだけでよい。

import {
  browserSupportsWebAuthn,
  startAuthentication,
  startRegistration,
  WebAuthnError,
} from '@simplewebauthn/browser'
import { loadEditorToken, saveEditorToken } from './editorAuth'

const SESSION_PREFIX = 'ps1.'

export type PasskeyItem = {
  id: string
  name: string
  createdAt: string
  lastUsedAt: string
  backedUp: boolean
  isCurrent: boolean
}

export function isPasskeySupported(): boolean {
  return browserSupportsWebAuthn()
}

/** 保存中の値が通行証か (違えば合言葉そのもの) */
export function isSessionToken(token: string): boolean {
  return token.startsWith(SESSION_PREFIX)
}

const ERROR_MESSAGES: Record<string, string> = {
  challenge_expired: '時間切れです。もう一度押してください',
  verification_failed: '認証に失敗しました',
  unknown_passkey: 'このパスキーは登録が消されています',
  master_token_required:
    'パスキーの追加は Notion のアクティベート URL を開いてから行えます',
  unauthorized: '認証が切れています',
}

async function post(path: string, body: unknown, token?: string) {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body ?? {}),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) {
    console.error('passkey api', path, res.status, data)
    throw new Error(
      ERROR_MESSAGES[data?.error] ?? `通信に失敗しました (${res.status})`
    )
  }
  return data
}

/** 認証器のダイアログで起きた失敗を、利用者に分かる言葉にする */
function describeWebAuthnError(error: unknown): Error {
  const name =
    error instanceof WebAuthnError
      ? (error.cause as Error | undefined)?.name
      : (error as Error | undefined)?.name
  if (name === 'NotAllowedError') return new Error('キャンセルされました')
  if (name === 'InvalidStateError')
    return new Error('この端末のパスキーは登録済みです')
  console.error(error)
  return error instanceof Error ? error : new Error(String(error))
}

/** 端末一覧に出す名前の初期値 */
export function guessDeviceName(): string {
  const ua = navigator.userAgent
  const device = /iPhone/.test(ua)
    ? 'iPhone'
    : /iPad/.test(ua)
    ? 'iPad'
    : /Android/.test(ua)
    ? 'Android'
    : /Windows/.test(ua)
    ? 'Windows'
    : /Mac/.test(ua)
    ? 'Mac'
    : '端末'
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /Chrome\//.test(ua)
    ? 'Chrome'
    : /Firefox\//.test(ua)
    ? 'Firefox'
    : /Safari\//.test(ua)
    ? 'Safari'
    : ''
  return browser ? `${device} ${browser}` : device
}

/** 合言葉で認証中の端末にパスキーを作り、保存値を通行証へ置き換える */
export async function registerPasskey(name: string): Promise<void> {
  const master = loadEditorToken()
  const { options, challengeToken } = await post(
    '/api/auth/passkey/register/options',
    {},
    master
  )
  let response
  try {
    response = await startRegistration({ optionsJSON: options })
  } catch (error) {
    throw describeWebAuthnError(error)
  }
  const { session } = await post(
    '/api/auth/passkey/register/verify',
    { response, challengeToken, name },
    master
  )
  // 合言葉を端末に残さない。漏れたときの被害が全端末に及ぶのは合言葉の方
  saveEditorToken(session)
}

export async function loginWithPasskey(): Promise<void> {
  const { options, challengeToken } = await post(
    '/api/auth/passkey/login/options',
    {}
  )
  let response
  try {
    response = await startAuthentication({ optionsJSON: options })
  } catch (error) {
    throw describeWebAuthnError(error)
  }
  const { session } = await post('/api/auth/passkey/login/verify', {
    response,
    challengeToken,
  })
  saveEditorToken(session)
}

export async function listPasskeys(token: string): Promise<PasskeyItem[]> {
  const res = await fetch('/api/auth/passkeys', {
    headers: { authorization: `Bearer ${token}` },
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) {
    throw new Error(`端末一覧を取得できません (${res.status})`)
  }
  return data.passkeys
}

export async function deletePasskey(token: string, id: string): Promise<void> {
  const res = await fetch(`/api/auth/passkeys/${encodeURIComponent(id)}`, {
    method: 'DELETE',
    headers: { authorization: `Bearer ${token}` },
  })
  if (!res.ok) throw new Error(`削除できませんでした (${res.status})`)
}

/**
 * 通行証の期限を延ばす。使うたびに呼ぶので、失敗しても今の通行証で
 * 使い続けられる (期限切れならその時に 401 でロック画面へ倒れる)
 */
export async function refreshSessionToken(token: string): Promise<void> {
  if (!isSessionToken(token)) return
  try {
    const { session } = await post('/api/auth/session/refresh', {}, token)
    if (session !== token) saveEditorToken(session)
  } catch (error) {
    console.error('session refresh failed', error)
  }
}
