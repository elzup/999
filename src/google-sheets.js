import { createSign } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token'
const GOOGLE_SHEETS_API = 'https://sheets.googleapis.com/v4/spreadsheets'
const DEFAULT_SCOPES = ['https://www.googleapis.com/auth/spreadsheets']
const DEFAULT_SERVICE_ACCOUNT_PATH = '.config/google-service-account.json'
const DEFAULT_ADC_PATH = join(
  homedir(),
  '.config',
  'gcloud',
  'application_default_credentials.json'
)

function base64url(input) {
  return Buffer.from(input)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '')
}

function signJwt(payload, privateKey) {
  const header = { alg: 'RS256', typ: 'JWT' }
  const unsignedToken = `${base64url(JSON.stringify(header))}.${base64url(
    JSON.stringify(payload)
  )}`
  const signer = createSign('RSA-SHA256')
  signer.update(unsignedToken)
  signer.end()
  const signature = signer.sign(privateKey)
  return `${unsignedToken}.${base64url(signature)}`
}

function normalizePrivateKey(privateKey) {
  return String(privateKey || '').replace(/\\n/g, '\n')
}

export function parseSpreadsheetUrl(url) {
  const match = String(url || '').match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/)
  if (!match) {
    throw new Error('Spreadsheet URL から spreadsheetId を抽出できませんでした')
  }

  const gidMatch = String(url || '').match(/[?#&]gid=(\d+)/)
  return {
    spreadsheetId: match[1],
    gid: gidMatch?.[1] || null,
  }
}

export function loadServiceAccount() {
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON
  if (rawJson) {
    return JSON.parse(rawJson)
  }

  const path =
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH || DEFAULT_SERVICE_ACCOUNT_PATH
  if (!existsSync(path)) {
    throw new Error(`Google service account 設定が見つかりません: ${path}`)
  }

  return JSON.parse(readFileSync(path, 'utf8'))
}

function loadGoogleCredentials() {
  const explicitPath =
    process.env.GOOGLE_SERVICE_ACCOUNT_PATH ||
    process.env.GOOGLE_APPLICATION_CREDENTIALS

  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON) {
    return JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON)
  }

  const candidatePaths = explicitPath
    ? [explicitPath]
    : [DEFAULT_SERVICE_ACCOUNT_PATH, DEFAULT_ADC_PATH]

  for (const path of candidatePaths) {
    if (existsSync(path)) {
      return JSON.parse(readFileSync(path, 'utf8'))
    }
  }

  throw new Error(
    `Google 認証設定が見つかりません: ${candidatePaths.join(', ')}`
  )
}

async function getServiceAccountAccessToken(credentials, scopes) {
  const now = Math.floor(Date.now() / 1000)
  const assertion = signJwt(
    {
      iss: credentials.client_email,
      scope: scopes.join(' '),
      aud: GOOGLE_TOKEN_URL,
      exp: now + 3600,
      iat: now,
    },
    normalizePrivateKey(credentials.private_key)
  )

  const body = new URLSearchParams({
    grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
    assertion,
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    throw new Error(
      `Google token の取得に失敗しました: ${res.status} ${res.statusText}`
    )
  }

  const json = await res.json()
  return json.access_token
}

async function getAuthorizedUserAccessToken(credentials, scopes) {
  const body = new URLSearchParams({
    client_id: credentials.client_id,
    client_secret: credentials.client_secret,
    refresh_token: credentials.refresh_token,
    grant_type: 'refresh_token',
    scope: scopes.join(' '),
  })

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })

  if (!res.ok) {
    throw new Error(
      `Google token の更新に失敗しました: ${res.status} ${res.statusText}`
    )
  }

  const json = await res.json()
  return json.access_token
}

function getQuotaProjectId(credentials) {
  return (
    process.env.GOOGLE_CLOUD_QUOTA_PROJECT || credentials.quota_project_id || ''
  )
}

export async function getAccessToken(scopes = DEFAULT_SCOPES) {
  if (process.env.GOOGLE_OAUTH_ACCESS_TOKEN) {
    return process.env.GOOGLE_OAUTH_ACCESS_TOKEN
  }

  const credentials = loadGoogleCredentials()
  if (credentials.type === 'service_account') {
    return getServiceAccountAccessToken(credentials, scopes)
  }
  if (credentials.type === 'authorized_user') {
    return getAuthorizedUserAccessToken(credentials, scopes)
  }

  throw new Error(
    `未対応の Google 認証 type です: ${credentials.type || '(unknown)'}`
  )
}

async function sheetsApi(path, init = {}) {
  const accessToken = await getAccessToken()
  const credentials = process.env.GOOGLE_OAUTH_ACCESS_TOKEN
    ? null
    : loadGoogleCredentials()
  const quotaProjectId = credentials ? getQuotaProjectId(credentials) : ''
  const res = await fetch(`${GOOGLE_SHEETS_API}${path}`, {
    ...init,
    headers: {
      authorization: `Bearer ${accessToken}`,
      ...(quotaProjectId ? { 'x-goog-user-project': quotaProjectId } : {}),
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      ...(init.headers || {}),
    },
  })

  if (!res.ok) {
    const text = await res.text()
    throw new Error(
      `Google Sheets API error: ${res.status} ${res.statusText} ${text}`
    )
  }

  if (res.status === 204) return null
  return res.json()
}

export async function getSheetTitleByGid(spreadsheetId, gid) {
  const data = await sheetsApi(
    `/${spreadsheetId}?fields=sheets(properties(sheetId,title))`
  )
  const sheet = data.sheets?.find(
    (entry) => String(entry.properties?.sheetId) === String(gid)
  )

  if (!sheet) {
    throw new Error(`gid=${gid} のシートが見つかりません`)
  }

  return sheet.properties.title
}

export async function getSpreadsheetSheets(spreadsheetId) {
  const data = await sheetsApi(
    `/${spreadsheetId}?fields=sheets(properties(sheetId,title,index))`
  )
  return data.sheets?.map((entry) => entry.properties) || []
}

export async function ensureSheetByTitle(spreadsheetId, title) {
  const sheets = await getSpreadsheetSheets(spreadsheetId)
  const existing = sheets.find((sheet) => sheet.title === title)
  if (existing) return existing

  const data = await sheetsApi(`/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    body: JSON.stringify({
      requests: [
        {
          addSheet: {
            properties: { title },
          },
        },
      ],
    }),
  })

  return data.replies?.[0]?.addSheet?.properties || null
}

export async function overwriteSheetValues({ spreadsheetId, gid, values }) {
  const title = await getSheetTitleByGid(spreadsheetId, gid)
  return overwriteSheetValuesByTitle({ spreadsheetId, title, values })
}

export async function overwriteSheetValuesByTitle({
  spreadsheetId,
  title,
  values,
}) {
  await ensureSheetByTitle(spreadsheetId, title)
  const encodedRange = encodeURIComponent(title)
  await sheetsApi(`/${spreadsheetId}/values/${encodedRange}:clear`, {
    method: 'POST',
    body: JSON.stringify({}),
  })

  const endColumn = values[0]?.length || 1
  const range = `${title}!A1:${columnName(endColumn)}${values.length}`
  await sheetsApi(
    `/${spreadsheetId}/values/${encodeURIComponent(
      range
    )}?valueInputOption=RAW`,
    {
      method: 'PUT',
      body: JSON.stringify({
        majorDimension: 'ROWS',
        values,
      }),
    }
  )

  return { title, rows: values.length, cols: endColumn }
}

function columnName(index) {
  let current = index
  let name = ''
  while (current > 0) {
    const remainder = (current - 1) % 26
    name = String.fromCharCode(65 + remainder) + name
    current = Math.floor((current - 1) / 26)
  }
  return name || 'A'
}
