// パスキー (WebAuthn) でのログインと、その後に使う通行証 (session token)。
//
// 利用者は 1 人なので «アカウント» は持たない。パスキーを登録できるのは
// 合言葉 (EDIT_TOKEN) を持つ人だけで、登録済みのパスキーで認証できれば
// 通行証を渡す。通行証は合言葉の代わりに Bearer で送る。
//
// store と webauthn を引数で受け取るのは numbers-route と同じ理由で、
// Firestore と実際の認証器が無くても経路をテストできるようにするため。

import { createHmac, timingSafeEqual } from 'node:crypto'

export const SESSION_PREFIX = 'ps1.'

// 使うたびに延長する前提の長さ。短いとオフライン明けのたびに認証が要る
export const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000
// 残りがこれを切ったら延長する。毎回発行し直すと通行証が無駄に入れ替わる
export const SESSION_RENEW_BELOW_MS = 15 * 24 * 60 * 60 * 1000
// 認証器のダイアログを出してから押すまでの猶予
export const CHALLENGE_TTL_MS = 5 * 60 * 1000

const RP_NAME = '999 暗記'
// 利用者は 1 人なので固定値。端末が変わっても同じ «人» のパスキーとして扱わせる
const USER_ID = new TextEncoder().encode('999-owner')
const USER_NAME = '999'
const MAX_NAME_LENGTH = 40

/** 合言葉から通行証の署名鍵を作る。合言葉を変えれば全端末の通行証が失効する */
export function deriveSessionKey(editToken) {
  return createHmac('sha256', editToken).update('passkey-session-v1').digest()
}

function b64url(buf) {
  return Buffer.from(buf).toString('base64url')
}

function sign(key, body) {
  return createHmac('sha256', key).update(body).digest()
}

/** kind: 's' = 通行証, 'reg' / 'auth' = チャレンジ (登録 / ログイン) */
export function signToken(key, payload) {
  const body = b64url(JSON.stringify(payload))
  return `${SESSION_PREFIX}${body}.${b64url(sign(key, body))}`
}

export function verifyToken(key, token, kind, now) {
  if (typeof token !== 'string' || !token.startsWith(SESSION_PREFIX))
    return null
  const [body, mac] = token.slice(SESSION_PREFIX.length).split('.')
  if (!body || !mac) return null
  const expected = sign(key, body)
  const actual = Buffer.from(mac, 'base64url')
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (payload.k !== kind || !(payload.exp > now)) return null
    return payload
  } catch {
    // 署名は合っているのに JSON でない = こちらが作った形ではない
    return null
  }
}

export function issueSession(key, credentialId, now) {
  return signToken(key, {
    k: 's',
    cid: credentialId,
    exp: now + SESSION_TTL_MS,
  })
}

function fail(status, error) {
  return { status, payload: { ok: false, error } }
}

function cleanName(name) {
  const text = String(name ?? '').trim()
  return text.slice(0, MAX_NAME_LENGTH) || '名前なし'
}

function toCredential(id, doc) {
  return {
    id,
    publicKey: new Uint8Array(Buffer.from(doc.publicKey, 'base64url')),
    counter: doc.counter ?? 0,
    transports: doc.transports ?? [],
  }
}

async function registerOptions({ store, webauthn, key, rp, now }) {
  const existing = await store.list()
  const options = await webauthn.generateRegistrationOptions({
    rpName: RP_NAME,
    rpID: rp.id,
    userID: USER_ID,
    userName: USER_NAME,
    attestationType: 'none',
    // 同じ認証器に 2 本目を作らせない (一覧に同じ端末が並ぶだけになる)
    excludeCredentials: existing.map(({ id, doc }) => ({
      id,
      transports: doc.transports ?? [],
    })),
    authenticatorSelection: {
      // ユーザー名を打たずに «パスキーでログイン» だけで選べるようにする
      residentKey: 'required',
      userVerification: 'required',
    },
  })
  const challengeToken = signToken(key, {
    k: 'reg',
    ch: options.challenge,
    exp: now + CHALLENGE_TTL_MS,
  })
  return { status: 200, payload: { ok: true, options, challengeToken } }
}

async function registerVerify({ body, store, webauthn, key, rp, now }) {
  const challenge = verifyToken(key, body?.challengeToken, 'reg', now)
  if (!challenge) return fail(400, 'challenge_expired')
  let result
  try {
    result = await webauthn.verifyRegistrationResponse({
      response: body.response,
      expectedChallenge: challenge.ch,
      expectedOrigin: rp.origins,
      expectedRPID: rp.id,
      requireUserVerification: true,
    })
  } catch (error) {
    // 署名や origin の不一致はここで例外になる。利用者の操作ミスと区別できないので 400
    console.error(error)
    return fail(400, 'verification_failed')
  }
  if (!result.verified) return fail(400, 'verification_failed')

  const { credential, credentialDeviceType, credentialBackedUp } =
    result.registrationInfo
  const iso = new Date(now).toISOString()
  await store.set(credential.id, {
    publicKey: b64url(credential.publicKey),
    counter: credential.counter,
    transports: credential.transports ?? [],
    name: cleanName(body.name),
    deviceType: credentialDeviceType,
    backedUp: credentialBackedUp,
    createdAt: iso,
    lastUsedAt: iso,
  })
  return {
    status: 200,
    payload: { ok: true, session: issueSession(key, credential.id, now) },
  }
}

async function loginOptions({ webauthn, key, rp, now }) {
  const options = await webauthn.generateAuthenticationOptions({
    rpID: rp.id,
    userVerification: 'required',
  })
  const challengeToken = signToken(key, {
    k: 'auth',
    ch: options.challenge,
    exp: now + CHALLENGE_TTL_MS,
  })
  return { status: 200, payload: { ok: true, options, challengeToken } }
}

async function loginVerify({ body, store, webauthn, key, rp, now }) {
  const challenge = verifyToken(key, body?.challengeToken, 'auth', now)
  if (!challenge) return fail(400, 'challenge_expired')
  const id = String(body?.response?.id ?? '')
  const doc = id ? await store.get(id) : undefined
  // 端末一覧から消したパスキーもここで弾かれる
  if (!doc) return fail(401, 'unknown_passkey')

  let result
  try {
    result = await webauthn.verifyAuthenticationResponse({
      response: body.response,
      expectedChallenge: challenge.ch,
      expectedOrigin: rp.origins,
      expectedRPID: rp.id,
      credential: toCredential(id, doc),
      requireUserVerification: true,
    })
  } catch (error) {
    console.error(error)
    return fail(401, 'verification_failed')
  }
  if (!result.verified) return fail(401, 'verification_failed')

  await store.update(id, {
    counter: result.authenticationInfo.newCounter,
    lastUsedAt: new Date(now).toISOString(),
  })
  return {
    status: 200,
    payload: { ok: true, session: issueSession(key, id, now) },
  }
}

async function listPasskeys({ store, auth }) {
  const items = await store.list()
  const passkeys = items
    .map(({ id, doc }) => ({
      id,
      name: doc.name,
      createdAt: doc.createdAt,
      lastUsedAt: doc.lastUsedAt,
      backedUp: Boolean(doc.backedUp),
      isCurrent: auth.kind === 'session' && auth.cid === id,
    }))
    .sort((a, b) => String(b.lastUsedAt).localeCompare(String(a.lastUsedAt)))
  return { status: 200, payload: { ok: true, passkeys } }
}

function refreshSession({ auth, key, now }) {
  if (auth.kind !== 'session') return fail(400, 'not_a_session')
  // 期限に余裕があるうちは同じものを返す (端末側の保存し直しを減らす)
  const session =
    auth.exp - now < SESSION_RENEW_BELOW_MS
      ? issueSession(key, auth.cid, now)
      : auth.token
  return { status: 200, payload: { ok: true, session } }
}

/**
 * /auth/* を捌く。該当しない path なら null。
 * auth は呼び出し側で解決済みの認証状態:
 *   null (未認証) | { kind: 'master' } | { kind: 'session', cid, exp, token }
 */
export async function handlePasskeyRequest(ctx) {
  const { method, path, auth } = ctx
  if (!path.startsWith('/auth/')) return null

  if (method === 'POST' && path === '/auth/passkey/login/options')
    return loginOptions(ctx)
  if (method === 'POST' && path === '/auth/passkey/login/verify')
    return loginVerify(ctx)

  if (!auth) return fail(401, 'unauthorized')

  // 新しいパスキーを足せるのは合言葉を持つ人だけ。通行証でも足せると、
  // 通行証 1 本の漏洩が «消しても作り直せる» 永続的な入口になる
  if (path.startsWith('/auth/passkey/register/')) {
    if (auth.kind !== 'master') return fail(403, 'master_token_required')
    if (method === 'POST' && path === '/auth/passkey/register/options')
      return registerOptions(ctx)
    if (method === 'POST' && path === '/auth/passkey/register/verify')
      return registerVerify(ctx)
  }

  if (method === 'GET' && path === '/auth/passkeys') return listPasskeys(ctx)
  const deleteMatch = path.match(/^\/auth\/passkeys\/([\w-]+)$/)
  if (method === 'DELETE' && deleteMatch) {
    await ctx.store.delete(deleteMatch[1])
    return { status: 200, payload: { ok: true } }
  }
  if (method === 'POST' && path === '/auth/session/refresh')
    return refreshSession(ctx)

  return fail(404, 'not_found')
}

/**
 * Bearer の値から認証状態を出す。通行証は署名と期限に加えて、元のパスキーが
 * まだ登録されているかも見る (端末一覧から消したら即座に締め出すため)
 */
export async function resolveAuth({ bearer, editToken, key, store, now }) {
  if (!bearer) return null
  if (bearer.startsWith(SESSION_PREFIX)) {
    const payload = verifyToken(key, bearer, 's', now)
    if (!payload) return null
    const doc = await store.get(payload.cid)
    if (!doc) return null
    return {
      kind: 'session',
      cid: payload.cid,
      exp: payload.exp,
      token: bearer,
    }
  }
  if (!editToken) return null
  const actual = Buffer.from(bearer)
  const expected = Buffer.from(editToken)
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected))
    return null
  return { kind: 'master' }
}
