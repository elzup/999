// 画像URLを取得して Buffer を返す。画像でない/巨大/失敗は例外。

const MAX_BYTES = 10 * 1024 * 1024 // 10MB
const TIMEOUT_MS = 15000

// 元サイトに断られたときの取り直しで名乗る UA。ボット名の UA や参照元なしを断るサイトがある
const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36'

/**
 * @param {string} url
 * @param {{asBrowser?: boolean, referer?: string}} [opts] asBrowser: ブラウザの UA と画像の Accept で取る。
 *   referer: 参照元 (画像が載っていたページ)。直リンクを断るサイト向け
 * @returns {Promise<{buffer: Buffer, contentType: string}>}
 */
export async function downloadImage(url, { asBrowser = false, referer } = {}) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: 'follow',
      headers: asBrowser
        ? {
            'user-agent': BROWSER_UA,
            accept: 'image/avif,image/webp,image/png,image/*;q=0.8,*/*;q=0.5',
            ...(referer ? { referer } : {}),
          }
        : { 'user-agent': 'Mozilla/5.0 (compatible; 999-word-images/1.0)' },
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
