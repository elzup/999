// 代表語コンソールのローカル API サーバ。
//   GET  /api/state                         候補と代表語 state
//   POST /api/rep {num,order,confirmed}    word-rep.json を更新
//   静的: console/rep.html, console/rep.js
// ※ ファイル書込が必要なため、loopback 限定で待ち受ける。

import { createReadStream, realpathSync } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { z } from 'zod'
import { buildRepState, setRep, SLOT_ORDER } from '../src/rep-store.js'

const here = dirname(fileURLToPath(import.meta.url))
const DEFAULT_PORT = Number(process.env.PORT || 6001)

export const REP_HOST = '127.0.0.1'
export const MAX_BODY_BYTES = 16 * 1024

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
}

const RepRequestSchema = z
  .object({
    num: z.string().regex(/^\d{3}$/),
    order: z.array(z.enum(SLOT_ORDER)).max(2),
    confirmed: z.boolean(),
  })
  .strict()

class RequestError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
  }
}

function sendJson(res, statusCode, value) {
  res.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  res.end(JSON.stringify(value))
}

export function readJsonBody(req, maxBytes = MAX_BODY_BYTES) {
  return new Promise((resolveBody, rejectBody) => {
    let data = ''
    let size = 0
    let isTooLarge = false

    req.on('data', (chunk) => {
      size += Buffer.byteLength(chunk)
      if (size > maxBytes) {
        isTooLarge = true
        data = ''
        return
      }
      if (!isTooLarge) data += chunk
    })
    req.on('end', () => {
      if (isTooLarge) {
        rejectBody(new RequestError(413, 'request body too large'))
        return
      }
      try {
        resolveBody(JSON.parse(data || '{}'))
      } catch {
        rejectBody(new RequestError(400, 'invalid json'))
      }
    })
    req.on('aborted', () =>
      rejectBody(new RequestError(400, 'request aborted'))
    )
    req.on('error', () => rejectBody(new RequestError(400, 'request failed')))
  })
}

function hasTraversal(rawPath) {
  let decoded
  try {
    decoded = decodeURIComponent(rawPath)
  } catch {
    throw new RequestError(400, 'invalid path encoding')
  }
  return decoded.replaceAll('\\', '/').split('/').includes('..')
}

function resolveStaticFile(staticRoot, rawPath) {
  if (hasTraversal(rawPath)) throw new RequestError(403, 'forbidden')

  const decoded = decodeURIComponent(rawPath)
  const relativePath =
    decoded === '/' ? 'rep.html' : decoded.replace(/^\/+/, '')
  const root = realpathSync(staticRoot)
  let file
  try {
    file = realpathSync(resolve(root, relativePath))
  } catch {
    return null
  }
  if (file !== root && !file.startsWith(root + sep)) {
    throw new RequestError(403, 'forbidden')
  }
  return file
}

export function createRepServer({
  getState = buildRepState,
  updateRep = setRep,
  staticRoot = here,
} = {}) {
  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url || '/', 'http://localhost')

      if (req.method === 'GET' && url.pathname === '/api/state') {
        sendJson(res, 200, getState())
        return
      }
      if (req.method === 'POST' && url.pathname === '/api/rep') {
        const parsed = RepRequestSchema.safeParse(await readJsonBody(req))
        if (!parsed.success) {
          sendJson(res, 400, { error: 'invalid representative request' })
          return
        }
        const result = updateRep(parsed.data)
        if (result?.error) {
          sendJson(res, 400, result)
          return
        }
        sendJson(res, 200, result)
        return
      }

      const rawPath = (req.url || '/').split('?')[0]
      const file = resolveStaticFile(staticRoot, rawPath)
      if (!file) {
        res.writeHead(404)
        res.end('not found')
        return
      }
      const stream = createReadStream(file)
      stream.on('error', () => {
        if (!res.headersSent) {
          res.writeHead(404)
          res.end('not found')
        } else {
          res.destroy()
        }
      })
      stream.on('open', () => {
        res.writeHead(200, {
          'content-type': MIME[extname(file)] || 'application/octet-stream',
        })
        stream.pipe(res)
      })
    } catch (error) {
      const statusCode = error?.statusCode || 500
      const message =
        statusCode >= 500 ? 'internal server error' : error.message
      sendJson(res, statusCode, { error: message })
    }
  })
}

export function startRepServer({
  port = DEFAULT_PORT,
  log = console.log,
  ...serverOptions
} = {}) {
  const server = createRepServer(serverOptions)
  server.listen(port, REP_HOST, () => {
    const address = server.address()
    const actualPort =
      typeof address === 'object' && address ? address.port : port
    log(`rep console: http://${REP_HOST}:${actualPort}`)
  })
  return server
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startRepServer()
}
