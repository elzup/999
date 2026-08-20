// アプリのデータ取得。
// spec: .vsdd/firestore-store/specs/spec-app-data-source.md
//
// これまではビルド時に焼き込んだ private/data.json を読んでいたため、
// 語を 1 つ直すたびに sync:all -> deploy が必要だった。
// チャンク (design:read-bundles) を直接読むことでその往復を無くす。

import { CHUNK_COUNT, mergeBundles } from './bundles.js'

export const UNAUTHORIZED = 'unauthorized'

/** 期待するチャンク ID の一覧 */
export function expectedChunkIds() {
  return Array.from({ length: CHUNK_COUNT }, (_, i) => `chunk_${i}`)
}

/**
 * チャンクを読んで辞書を組み立てる。
 *
 * @param readChunk (id) => bundle | null   1 件読む関数 (認証は呼び出し側の責務)
 * @returns { numbers, missing } 一部が欠けても、取れた範囲で動作を続ける
 */
export async function loadAppData({ readChunk }) {
  const ids = expectedChunkIds()
  const results = await Promise.all(
    ids.map(async (id) => {
      try {
        return { id, bundle: await readChunk(id) }
      } catch (error) {
        if (error?.message === UNAUTHORIZED) throw error
        return { id, bundle: null }
      }
    })
  )

  const found = results.filter((r) => r.bundle)
  const missing = results.filter((r) => !r.bundle).map((r) => r.id)

  return {
    numbers: mergeBundles(found.map((r) => r.bundle)),
    missing,
  }
}

/**
 * 前回取得した内容を控えておくための最小の入れ物。
 * オフライン起動 (REQ-APP-003) はこれを読む。
 */
export function makeCache(storage, key = 'appDataCache999') {
  return {
    read() {
      try {
        const raw = storage.getItem(key)
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    },
    write(value) {
      try {
        storage.setItem(key, JSON.stringify(value))
      } catch {
        /* 容量超過やプライベートモードでも機能は落とさない */
      }
    },
  }
}

/**
 * オンラインなら取得し、失敗したらキャッシュに倒す。
 * 認証エラーだけはキャッシュに倒さず投げ直す (Locked 画面へ倒すため)。
 */
export async function loadWithCache({ readChunk, cache }) {
  try {
    const fresh = await loadAppData({ readChunk })
    // 1 件も取れなかったのは «成功して空» ではなく失敗。
    // ここを通すと、通信断のときアプリが真っ白な辞書で起動する
    if (fresh.numbers.length === 0) throw new Error('no chunk could be read')
    // 全部揃ったときだけ控える。欠けた状態を焼き付けない
    if (fresh.missing.length === 0) cache.write(fresh.numbers)
    return { ...fresh, fromCache: false }
  } catch (error) {
    if (error?.message === UNAUTHORIZED) throw error
    const cached = cache.read()
    if (!cached) throw error
    return { numbers: cached, missing: [], fromCache: true }
  }
}
