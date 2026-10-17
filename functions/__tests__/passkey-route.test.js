import { describe, expect, it, vi } from 'vitest'
import {
  CHALLENGE_TTL_MS,
  SESSION_RENEW_BELOW_MS,
  SESSION_TTL_MS,
  deriveSessionKey,
  handlePasskeyRequest,
  issueSession,
  resolveAuth,
  signToken,
  verifyToken,
} from '../passkey-route.js'

const NOW = Date.parse('2026-10-16T00:00:00.000Z')
const EDIT_TOKEN = 'master-secret'
const key = deriveSessionKey(EDIT_TOKEN)
const rp = { id: 'example.test', origins: ['https://example.test'] }

function makeStore(initial = {}) {
  const docs = new Map(Object.entries(initial))
  return {
    docs,
    get: vi.fn(async (id) => docs.get(id)),
    set: vi.fn(async (id, doc) => void docs.set(id, doc)),
    update: vi.fn(async (id, patch) => {
      docs.set(id, { ...docs.get(id), ...patch })
    }),
    delete: vi.fn(async (id) => void docs.delete(id)),
    list: vi.fn(async () =>
      [...docs.entries()].map(([id, doc]) => ({ id, doc }))
    ),
  }
}

const storedDoc = {
  publicKey: Buffer.from([1, 2, 3]).toString('base64url'),
  counter: 0,
  transports: ['internal'],
  name: 'Mac',
  createdAt: '2026-10-01T00:00:00.000Z',
  lastUsedAt: '2026-10-01T00:00:00.000Z',
}

/** 実際の署名検証は @simplewebauthn に任せる。ここでは経路の判断だけを見る */
function makeWebAuthn({ verified = true } = {}) {
  return {
    generateRegistrationOptions: vi.fn(async () => ({ challenge: 'reg-ch' })),
    verifyRegistrationResponse: vi.fn(async () => ({
      verified,
      registrationInfo: {
        credential: {
          id: 'cred-new',
          publicKey: new Uint8Array([9, 9]),
          counter: 0,
          transports: ['hybrid'],
        },
        credentialDeviceType: 'multiDevice',
        credentialBackedUp: true,
      },
    })),
    generateAuthenticationOptions: vi.fn(async () => ({
      challenge: 'auth-ch',
    })),
    verifyAuthenticationResponse: vi.fn(async () => ({
      verified,
      authenticationInfo: { newCounter: 5 },
    })),
  }
}

const call = (over) =>
  handlePasskeyRequest({
    method: 'POST',
    body: {},
    auth: null,
    key,
    rp,
    now: NOW,
    store: makeStore(),
    webauthn: makeWebAuthn(),
    ...over,
  })

describe('signToken / verifyToken', () => {
  it('署名・種類・期限がそろったものだけ通す', () => {
    const token = signToken(key, { k: 's', cid: 'a', exp: NOW + 1000 })
    expect(verifyToken(key, token, 's', NOW)?.cid).toBe('a')
    expect(verifyToken(key, token, 'auth', NOW)).toBeNull()
    expect(verifyToken(key, token, 's', NOW + 1000)).toBeNull()
    expect(verifyToken(deriveSessionKey('other'), token, 's', NOW)).toBeNull()
  })

  it('中身を書き換えると署名が合わない', () => {
    const token = signToken(key, { k: 's', cid: 'a', exp: NOW + 1000 })
    const [, mac] = token.split('.').slice(-2)
    const forged = Buffer.from(
      JSON.stringify({ k: 's', cid: 'b', exp: NOW + 1000 })
    ).toString('base64url')
    expect(verifyToken(key, `ps1.${forged}.${mac}`, 's', NOW)).toBeNull()
  })
})

describe('resolveAuth', () => {
  const resolve = (bearer, store = makeStore({ cred: storedDoc })) =>
    resolveAuth({ bearer, editToken: EDIT_TOKEN, key, store, now: NOW })

  it('合言葉なら master', async () => {
    expect(await resolve(EDIT_TOKEN)).toEqual({ kind: 'master' })
    expect(await resolve('wrong')).toBeNull()
    expect(await resolve('')).toBeNull()
  })

  it('通行証は元のパスキーが消えたら無効になる', async () => {
    const session = issueSession(key, 'cred', NOW)
    expect((await resolve(session))?.kind).toBe('session')
    expect(await resolve(session, makeStore())).toBeNull()
  })
})

describe('handlePasskeyRequest', () => {
  it('/auth/ 以外は扱わない', async () => {
    expect(await call({ path: '/app/data' })).toBeNull()
  })

  it('登録は合言葉が要る (通行証では足せない)', async () => {
    const path = '/auth/passkey/register/options'
    expect((await call({ path })).status).toBe(401)
    const session = { kind: 'session', cid: 'cred', exp: NOW + 1, token: 't' }
    expect((await call({ path, auth: session })).status).toBe(403)
    const res = await call({ path, auth: { kind: 'master' } })
    expect(res.status).toBe(200)
    expect(verifyToken(key, res.payload.challengeToken, 'reg', NOW)?.ch).toBe(
      'reg-ch'
    )
  })

  it('登録が通ると保存して通行証を返す', async () => {
    const store = makeStore()
    const challengeToken = signToken(key, {
      k: 'reg',
      ch: 'reg-ch',
      exp: NOW + CHALLENGE_TTL_MS,
    })
    const res = await call({
      path: '/auth/passkey/register/verify',
      auth: { kind: 'master' },
      body: { response: {}, challengeToken, name: '  iPhone  ' },
      store,
    })
    expect(res.status).toBe(200)
    expect(store.docs.get('cred-new')).toMatchObject({
      name: 'iPhone',
      transports: ['hybrid'],
      backedUp: true,
    })
    expect(verifyToken(key, res.payload.session, 's', NOW)?.cid).toBe(
      'cred-new'
    )
  })

  it('期限切れのチャレンジでは登録しない', async () => {
    const store = makeStore()
    const challengeToken = signToken(key, { k: 'reg', ch: 'x', exp: NOW })
    const res = await call({
      path: '/auth/passkey/register/verify',
      auth: { kind: 'master' },
      body: { response: {}, challengeToken },
      store,
    })
    expect(res.status).toBe(400)
    expect(store.set).not.toHaveBeenCalled()
  })

  it('ログインは未認証で通り、カウンタと最終利用を更新する', async () => {
    const store = makeStore({ cred: storedDoc })
    const options = await call({ path: '/auth/passkey/login/options', store })
    const res = await call({
      path: '/auth/passkey/login/verify',
      body: {
        response: { id: 'cred' },
        challengeToken: options.payload.challengeToken,
      },
      store,
    })
    expect(res.status).toBe(200)
    expect(store.docs.get('cred')).toMatchObject({
      counter: 5,
      lastUsedAt: new Date(NOW).toISOString(),
    })
  })

  it('消したパスキー・署名不一致ではログインできない', async () => {
    const challengeToken = signToken(key, {
      k: 'auth',
      ch: 'auth-ch',
      exp: NOW + CHALLENGE_TTL_MS,
    })
    const body = { response: { id: 'cred' }, challengeToken }
    const path = '/auth/passkey/login/verify'
    expect((await call({ path, body })).status).toBe(401)
    const res = await call({
      path,
      body,
      store: makeStore({ cred: storedDoc }),
      webauthn: makeWebAuthn({ verified: false }),
    })
    expect(res.status).toBe(401)
  })

  it('一覧は今の端末に印を付け、削除できる', async () => {
    const store = makeStore({ cred: storedDoc })
    const auth = { kind: 'session', cid: 'cred', exp: NOW + 1, token: 't' }
    const list = await call({
      method: 'GET',
      path: '/auth/passkeys',
      auth,
      store,
    })
    expect(list.payload.passkeys).toEqual([
      expect.objectContaining({ id: 'cred', name: 'Mac', isCurrent: true }),
    ])
    await call({ method: 'DELETE', path: '/auth/passkeys/cred', auth, store })
    expect(store.docs.has('cred')).toBe(false)
  })

  it('通行証の延長は残りが少ないときだけ発行し直す', async () => {
    const fresh = issueSession(key, 'cred', NOW)
    const freshAuth = {
      kind: 'session',
      cid: 'cred',
      exp: NOW + SESSION_TTL_MS,
      token: fresh,
    }
    const path = '/auth/session/refresh'
    expect((await call({ path, auth: freshAuth })).payload.session).toBe(fresh)

    const old = {
      ...freshAuth,
      exp: NOW + SESSION_RENEW_BELOW_MS - 1,
      token: 'old-token',
    }
    const renewed = (await call({ path, auth: old })).payload.session
    expect(renewed).not.toBe('old-token')
    expect(verifyToken(key, renewed, 's', NOW)?.exp).toBe(NOW + SESSION_TTL_MS)
  })
})
