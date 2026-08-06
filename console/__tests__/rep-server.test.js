import { mkdtempSync, symlinkSync, writeFileSync } from 'node:fs'
import { request } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  MAX_BODY_BYTES,
  REP_HOST,
  createRepServer,
  startRepServer,
} from '../rep-server.js'

const servers = []

afterEach(async () => {
  await Promise.all(
    servers.splice(0).map(
      (server) =>
        new Promise((resolve) => {
          server.close(resolve)
        })
    )
  )
})

async function listen(server) {
  servers.push(server)
  await new Promise((resolve) => server.listen(0, REP_HOST, resolve))
  const address = server.address()
  return { host: REP_HOST, port: address.port }
}

function rawRequest({
  host,
  port,
  path,
  method = 'GET',
  body = '',
  headers = {},
}) {
  return new Promise((resolve, reject) => {
    const req = request({ host, port, path, method, headers }, (res) => {
      let responseBody = ''
      res.setEncoding('utf8')
      res.on('data', (chunk) => (responseBody += chunk))
      res.on('end', () =>
        resolve({ status: res.statusCode, body: responseBody })
      )
    })
    req.on('error', reject)
    req.end(body)
  })
}

function createStaticRoot() {
  const root = mkdtempSync(join(tmpdir(), 'rep-server-'))
  writeFileSync(join(root, 'rep.html'), '<h1>rep</h1>')
  return root
}

describe('representative console server', () => {
  it('REQ-REP-004: defaults to the IPv4 loopback interface', async () => {
    const server = startRepServer({ port: 0, log: () => {} })
    servers.push(server)
    await new Promise((resolve) => server.once('listening', resolve))

    expect(server.address().address).toBe(REP_HOST)
  })

  it('REQ-REP-004: cannot override the loopback interface', async () => {
    const server = startRepServer({
      port: 0,
      host: '0.0.0.0',
      log: () => {},
    })
    servers.push(server)
    await new Promise((resolve) => server.once('listening', resolve))

    expect(server.address().address).toBe(REP_HOST)
  })

  it('REQ-REP-001: returns the complete injected console state', async () => {
    const state = { slots: ['wh1'], pop: { mean: 1, std: 1 }, words: [] }
    const server = createRepServer({
      getState: () => state,
      staticRoot: createStaticRoot(),
    })
    const address = await listen(server)

    const response = await rawRequest({ ...address, path: '/api/state' })

    expect(response.status).toBe(200)
    expect(JSON.parse(response.body)).toEqual(state)
  })

  it('REQ-REP-002: accepts a valid representative update', async () => {
    const updateRep = vi.fn((body) => ({ ...body }))
    const server = createRepServer({
      updateRep,
      staticRoot: createStaticRoot(),
    })
    const address = await listen(server)
    const body = JSON.stringify({
      num: '051',
      order: ['wh1', 'wm1'],
      confirmed: true,
    })

    const response = await rawRequest({
      ...address,
      path: '/api/rep',
      method: 'POST',
      body,
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(200)
    expect(updateRep).toHaveBeenCalledWith(JSON.parse(body))
  })

  it.each([
    { num: '051', slot: 'wh1', v: -1 },
    { num: '051', slot: 'wm3', v: 0 },
    { num: '051', slot: 'wh1', v: 2 },
    { num: '051', slot: 'wh1', v: null },
  ])('REQ-REP-007: accepts a valid rating %#', async (body) => {
    const updateScore = vi.fn((input) => ({ ...input }))
    const server = createRepServer({
      updateScore,
      staticRoot: createStaticRoot(),
    })
    const address = await listen(server)

    const response = await rawRequest({
      ...address,
      path: '/api/score',
      method: 'POST',
      body: JSON.stringify(body),
      headers: { 'content-type': 'application/json' },
    })

    expect(response.status).toBe(200)
    expect(updateScore).toHaveBeenCalledWith(body)
  })

  it.each([
    { num: '51', slot: 'wh1', v: 1 },
    { num: '051', slot: 'w1', v: 1 },
    { num: '051', slot: 'wh1', v: 3 },
    { num: '051', slot: 'wh1', v: -2 },
    { num: '051', slot: 'wh1', v: 1.5 },
    { num: '051', slot: 'wh1', v: '1' },
    { num: '051', slot: 'wh1' },
    { num: '051', slot: 'wh1', v: 1, extra: true },
  ])(
    'REQ-REP-007: rejects an invalid rating %# without writing',
    async (body) => {
      const updateScore = vi.fn()
      const server = createRepServer({
        updateScore,
        staticRoot: createStaticRoot(),
      })
      const address = await listen(server)

      const response = await rawRequest({
        ...address,
        path: '/api/score',
        method: 'POST',
        body: JSON.stringify(body),
      })

      expect(response.status).toBe(400)
      expect(updateScore).not.toHaveBeenCalled()
    }
  )

  it.each([
    { num: '51', order: ['wh1'], confirmed: true },
    { num: '051', order: 'wh1', confirmed: true },
    { num: '051', order: ['unknown'], confirmed: true },
    { num: '051', order: ['wh1'], confirmed: 'true' },
    { num: '051', order: ['wh1'], confirmed: true, extra: true },
  ])(
    'REQ-REP-003: rejects invalid request %# without writing',
    async (body) => {
      const updateRep = vi.fn()
      const server = createRepServer({
        updateRep,
        staticRoot: createStaticRoot(),
      })
      const address = await listen(server)

      const response = await rawRequest({
        ...address,
        path: '/api/rep',
        method: 'POST',
        body: JSON.stringify(body),
      })

      expect(response.status).toBe(400)
      expect(updateRep).not.toHaveBeenCalled()
    }
  )

  it('REQ-REP-003: returns 400 for malformed JSON', async () => {
    const updateRep = vi.fn()
    const server = createRepServer({
      updateRep,
      staticRoot: createStaticRoot(),
    })
    const address = await listen(server)

    const response = await rawRequest({
      ...address,
      path: '/api/rep',
      method: 'POST',
      body: '{broken',
    })

    expect(response.status).toBe(400)
    expect(updateRep).not.toHaveBeenCalled()
  })

  it('REQ-REP-003: converts unknown-number store errors to 400', async () => {
    const server = createRepServer({
      updateRep: () => ({ error: 'unknown num' }),
      staticRoot: createStaticRoot(),
    })
    const address = await listen(server)

    const response = await rawRequest({
      ...address,
      path: '/api/rep',
      method: 'POST',
      body: JSON.stringify({ num: '999', order: [], confirmed: false }),
    })

    expect(response.status).toBe(400)
    expect(JSON.parse(response.body)).toEqual({ error: 'unknown num' })
  })

  it('REQ-REP boundary: rejects an oversized body with 413', async () => {
    const updateRep = vi.fn()
    const server = createRepServer({
      updateRep,
      staticRoot: createStaticRoot(),
    })
    const address = await listen(server)

    const response = await rawRequest({
      ...address,
      path: '/api/rep',
      method: 'POST',
      body: 'x'.repeat(MAX_BODY_BYTES + 1),
    })

    expect(response.status).toBe(413)
    expect(updateRep).not.toHaveBeenCalled()
  })

  it('REQ-REP boundary: accepts the exact body-size boundary for parsing', async () => {
    const updateRep = vi.fn()
    const server = createRepServer({
      updateRep,
      staticRoot: createStaticRoot(),
    })
    const address = await listen(server)

    const response = await rawRequest({
      ...address,
      path: '/api/rep',
      method: 'POST',
      body: 'x'.repeat(MAX_BODY_BYTES),
    })

    expect(response.status).toBe(400)
    expect(updateRep).not.toHaveBeenCalled()
  })

  it.each(['/../outside.txt', '/%2e%2e/outside.txt'])(
    'REQ-REP-005: rejects traversal path %s with 403',
    async (path) => {
      const server = createRepServer({ staticRoot: createStaticRoot() })
      const address = await listen(server)

      const response = await rawRequest({ ...address, path })

      expect(response.status).toBe(403)
    }
  )

  it('REQ-REP-005: rejects a symlink that escapes the static root', async () => {
    const root = createStaticRoot()
    const outside = mkdtempSync(join(tmpdir(), 'rep-outside-'))
    writeFileSync(join(outside, 'secret.txt'), 'secret')
    symlinkSync(join(outside, 'secret.txt'), join(root, 'escape.txt'))
    const server = createRepServer({ staticRoot: root })
    const address = await listen(server)

    const response = await rawRequest({ ...address, path: '/escape.txt' })

    expect(response.status).toBe(403)
  })
})
