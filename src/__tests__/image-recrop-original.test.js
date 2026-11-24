// 切り抜き直しは、取得時に残した元画像を使う (元サイトは後から再 DL を 403 で断ることがある。D-0095)。
// DL・アップロードはモック。webp 変換 (sharp) だけは本物を通す。

import sharp from 'sharp'
import { describe, expect, it } from 'vitest'
import {
  fetchCandidates,
  recropAt,
  SOURCE_REFUSED,
} from '../images/fetch-one.js'
import { ORIGINAL_MAX_PX } from '../images/process.js'

const png = (width, height) =>
  sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 0, b: 0 } },
  })
    .png()
    .toBuffer()

function bucket() {
  const files = new Map()
  const save = async (buffer, key) => {
    files.set(key, buffer)
    return { url: `https://bucket.test/${key}` }
  }
  const download = async (url) => {
    const key = url.replace('https://bucket.test/', '')
    if (files.has(key)) return { buffer: files.get(key) }
    throw new Error('HTTP 403 Forbidden')
  }
  return { files, save, download }
}

describe('元画像を残して切り抜き直す', () => {
  it('候補を取るときに元画像を words/orig/ に縮めて残す', async () => {
    const { files, save } = bucket()
    const [got] = await fetchCandidates({
      query: 'q',
      search: async () => [{ imageUrl: 'https://src.test/a.png' }],
      download: async () => ({ buffer: await png(3200, 1600) }),
      uploadWebp: save,
      saveOriginal: save,
    })
    expect(got.originalUrl).toMatch(/^https:\/\/bucket\.test\/words\/orig\//)
    const key = got.originalUrl.replace('https://bucket.test/', '')
    const meta = await sharp(files.get(key)).metadata()
    expect([meta.width, meta.height]).toEqual([ORIGINAL_MAX_PX, 800])
  })

  it('元サイトが断っても、残した元画像から切り抜ける', async () => {
    const { files, save, download } = bucket()
    files.set('words/orig/x.webp', await png(800, 400))
    const image = {
      url: 'https://bucket.test/words/old.webp',
      hash: 'old',
      sourceImageUrl: 'https://src.test/gone.png',
      originalUrl: 'https://bucket.test/words/orig/x.webp',
    }
    const got = await recropAt({
      image,
      uploadWebp: save,
      saveOriginal: save,
      rect: { x: 0, y: 0, w: 0.5, h: 1 },
      download,
    })
    expect(got.hash).not.toBe('old')
    expect(got.originalUrl).toBe(image.originalUrl)
  })

  it('元画像が無く元サイトも断るときは取り直しを促す', async () => {
    const { save, download } = bucket()
    await expect(
      recropAt({
        image: { hash: 'old', sourceImageUrl: 'https://src.test/gone.png' },
        uploadWebp: save,
        saveOriginal: save,
        position: 'top',
        download,
      })
    ).rejects.toThrow(SOURCE_REFUSED)
  })

  it('元サイトがボット名の UA を断っても、ブラウザとして載っていたページから取り直す', async () => {
    const { save } = bucket()
    const calls = []
    const got = await recropAt({
      image: {
        hash: 'old',
        sourceImageUrl: 'https://src.test/hotlink.png',
        sourcePage: 'https://src.test/page',
      },
      uploadWebp: save,
      saveOriginal: save,
      position: 'top',
      download: async (url, opts) => {
        calls.push(opts)
        if (!opts?.asBrowser) throw new Error('HTTP 403 Forbidden')
        return { buffer: await png(600, 300) }
      },
    })
    expect(calls[1]).toEqual({
      asBrowser: true,
      referer: 'https://src.test/page',
    })
    expect(got.originalUrl).toMatch(/words\/orig\//)
  })

  it('base: current は元画像に触らず、今の画像の中の範囲で切り抜く (元サイトが断っても切れる)', async () => {
    const { files, save, download } = bucket()
    files.set('words/now.webp', await png(400, 400))
    const got = await recropAt({
      image: {
        hash: 'old',
        url: 'https://bucket.test/words/now.webp',
        sourceImageUrl: 'https://src.test/gone.png',
      },
      uploadWebp: save,
      saveOriginal: save,
      rect: { x: 0.25, y: 0, w: 0.5, h: 0.5 },
      base: 'current',
      download,
    })
    expect(got.hash).not.toBe('old')
    expect(got.originalUrl).toBeUndefined()
    expect(got.sourceImageUrl).toBe('https://src.test/gone.png')
  })

  it('base: current は範囲が無ければ断る', async () => {
    const { save, download } = bucket()
    await expect(
      recropAt({
        image: { hash: 'old', url: 'https://bucket.test/words/now.webp' },
        uploadWebp: save,
        saveOriginal: save,
        base: 'current',
        download,
      })
    ).rejects.toThrow('範囲')
  })

  it('元サイトから取れたら元画像を残し、次からはそれを使う', async () => {
    const { save } = bucket()
    const got = await recropAt({
      image: { hash: 'old', sourceImageUrl: 'https://src.test/ok.png' },
      uploadWebp: save,
      saveOriginal: save,
      position: 'centre',
      download: async () => ({ buffer: await png(600, 300) }),
    })
    expect(got.originalUrl).toMatch(/words\/orig\//)
  })
})
