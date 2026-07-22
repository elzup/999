// 代表語コンソールのローカル API サーバ。
//   GET  /api/state              words(人/物トップ候補+参考スコア) + rep を返す
//   POST /api/rep {num,order,confirmed}  word-rep.json を更新
//   静的: console/rep.html, console/rep.js
// ※ ファイル書込が必要なのでローカル運用専用。

import { createReadStream } from 'node:fs'
import { createServer } from 'node:http'
import { dirname, extname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildRepState, setRep } from '../src/rep-store.js'

const here = dirname(fileURLToPath(import.meta.url))
const PORT = Number(process.env.PORT || 6001)

const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
}

function sendJson(res, code, obj) {
  res.writeHead(code, { 'content-type': 'application/json' })
  res.end(JSON.stringify(obj))
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = ''
    req.on('data', (c) => (data += c))
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'))
      } catch {
        resolve({})
      }
    })
  })
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`)

  if (req.method === 'GET' && url.pathname === '/api/state') {
    return sendJson(res, 200, buildRepState())
  }
  if (req.method === 'POST' && url.pathname === '/api/rep') {
    const body = await readBody(req)
    if (!body.num) return sendJson(res, 400, { error: 'num required' })
    return sendJson(res, 200, setRep(body))
  }

  // static (rep.html をデフォルトに)
  const name = url.pathname === '/' ? '/rep.html' : url.pathname
  const file = join(here, name)
  if (!file.startsWith(here)) {
    res.writeHead(403)
    return res.end('forbidden')
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
})

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  server.listen(PORT, () => {
    console.log(`rep console: http://localhost:${PORT}`)
  })
}
