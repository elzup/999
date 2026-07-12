const EDIT_TOKEN_KEY = 'editToken999'

// `token` は閲覧=編集を統一したアクセストークン。`edit_token`/`editor_token` は後方互換。
const TOKEN_QUERY_KEYS = ['token', 'edit_token', 'editor_token']

export function consumeEditorTokenFromUrl(): string {
  const url = new URL(window.location.href)
  const token = TOKEN_QUERY_KEYS.map((key) => url.searchParams.get(key)).find(
    (value): value is string => Boolean(value?.trim())
  )

  if (token) {
    localStorage.setItem(EDIT_TOKEN_KEY, token.trim())
    for (const key of TOKEN_QUERY_KEYS) url.searchParams.delete(key)
    window.history.replaceState(
      null,
      '',
      `${url.pathname}${url.search}${url.hash}`
    )
    return token.trim()
  }

  return loadEditorToken()
}

export function loadEditorToken(): string {
  return localStorage.getItem(EDIT_TOKEN_KEY) || ''
}

export function saveEditorToken(token: string) {
  localStorage.setItem(EDIT_TOKEN_KEY, token.trim())
}

export function clearEditorToken() {
  localStorage.removeItem(EDIT_TOKEN_KEY)
}
