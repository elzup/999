// 画像URLを取得して Buffer を返す。画像でない/巨大/失敗は例外。

const MAX_BYTES = 10 * 1024 * 1024 // 10MB
const TIMEOUT_MS = 15000

/**
 * @param {string} url
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
export async function downloadImage(url) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: {
        'user-agent': 'Mozilla/5.0 (compatible; 999-word-images/1.0)',
      },
    })
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`)
    }
    const contentType = (res.headers.get('content-type') || '').toLowerCase()
    if (!contentType.startsWith('image/')) {
      throw new Error(`not an image (content-type: ${contentType || 'none'})`)
    }
    const arrayBuf = await res.arrayBuffer()
    const buffer = Buffer.from(arrayBuf)
    if (buffer.length === 0) throw new Error('empty body')
    if (buffer.length > MAX_BYTES) {
      throw new Error(`too large: ${buffer.length} bytes`)
    }
    return { buffer, contentType }
  } finally {
    clearTimeout(timer)
  }
}
