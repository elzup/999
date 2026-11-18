// 画像ピッカー (候補タブ・詳細パネルの画像) の API と純粋なロジック。D-0088 / D-0089。
// 画像の正本は Firestore imageSlots で、読み書きは Function の /api/console/* を通す
// (functions/console-route.js。web 版の画像コンソールと同じ経路)。
//
// 配信データ (data.json) の画像は nr deploy の時点のもの。ピッカーで選んだ画像は
// 次のデプロイまで配信データに載らないので、この画面の中では overrides で上書きして見せる。
import { useEffect, useState } from 'preact/hooks'

export type SlotImage = {
  url: string
  hash: string
  sourcePage?: string
  sourceImageUrl?: string
}

export type ImageTarget = {
  id: string
  kind: string
  slots?: string[]
  [slot: string]: unknown
}

export type ImageState = {
  targets: ImageTarget[]
  kinds: Record<string, { label: string; slots: string[] }>
  slotNames?: Record<string, string>
  images: Record<string, Record<string, SlotImage>>
  keep: Record<string, true>
  redo: Record<string, { flaggedAt: string; reason?: string }>
  canFetch?: boolean
}

export type CandidateResult = {
  query: string
  current: SlotImage | null
  candidates: SlotImage[]
}

/** アプリの枠名 (シート・DB の名前) → 画像データの枠名 (src/images/targets.js の CANONICAL_SLOT の逆) */
export const IMAGE_SLOT_OF: Record<string, string> = {
  wh1: 'w1',
  wh2: 'w1_2',
  wh3: 'wh3',
  wm1: 'w2',
  wm2: 'w2_2',
  wm3: 'wm3',
}

// 候補は検索と 10 枚の DL を待つので、番号の API (15 秒) より長く待つ。
// Hosting から Function への転送が 60 秒で切れるので、それより少し長く
const TIMEOUT_MS = 65_000

async function call<T>(
  path: string,
  token: string,
  body?: Record<string, unknown>
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  let res: Response
  try {
    res = await fetch(`/api/console/${path}`, {
      method: body ? 'POST' : 'GET',
      headers: {
        authorization: `Bearer ${token}`,
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    console.error('image api', path, err)
    throw new Error('通信できません (圏外・タイムアウト)')
  } finally {
    clearTimeout(timer)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) throw new Error(data?.error || `失敗しました (${res.status})`)
  if (data && data.ok === false) throw new Error(data.error || '失敗しました')
  return data as T
}

export const fetchImageState = (token: string) =>
  call<ImageState>('state', token)

export const fetchCandidates = ({
  token,
  id,
  slot,
  query,
}: {
  token: string
  id: string
  slot: string
  query?: string
}) =>
  call<CandidateResult>('candidates', token, {
    id,
    slot,
    ...(query ? { query } : {}),
  })

/** 候補を採用する。Function はこの枠に出した画像だけを受け付けるので hash だけ送る */
export const pickImage = async ({
  token,
  id,
  slot,
  hash,
}: {
  token: string
  id: string
  slot: string
  hash: string
}) =>
  (
    await call<{ image: SlotImage }>('set-image', token, {
      id,
      slot,
      image: { hash },
    })
  ).image

// ── この画面の中で選んだ画像 (次のデプロイまで配信データに無い) ──

let overrides: Record<string, SlotImage> = {}
const listeners = new Set<() => void>()
const keyOf = (id: string, slot: string) => `${id}:${slot}`

export function setImageOverride(id: string, slot: string, image: SlotImage) {
  overrides = { ...overrides, [keyOf(id, slot)]: image }
  listeners.forEach((fn) => fn())
}

export const imageOverride = (id: string, slot: string) =>
  overrides[keyOf(id, slot)]

/** 選び直した画像があればそれを返す。無ければ undefined (配信データの画像を使う) */
export function useImageOverride(id: string, slot: string) {
  const [image, setImage] = useState(() => imageOverride(id, slot))
  useEffect(() => {
    const update = () => setImage(imageOverride(id, slot))
    update()
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [id, slot])
  return image
}

// ── 候補タブの一覧 ──

export type CandidateFilter = 'redo' | 'missing' | 'all'

export const CANDIDATE_FILTERS: { id: CandidateFilter; label: string }[] = [
  { id: 'redo', label: '撮り直し' },
  { id: 'missing', label: '未取得' },
  { id: 'all', label: '全部' },
]

export type CandidateItem = {
  id: string
  slot: string
  /** 見出しに出す枠名 (wh1 など) */
  slotName: string
  word: string
  image: SlotImage | null
  keep: boolean
  redo: boolean
}

// #i はアバター固定の枠 (console と同じく取り直しの対象にしない)
const isAvatarWord = (word: string) => /#i\b/.test(word)

/** 候補タブに並べる枠。対象 (番号・日付・カード) の順のまま */
export function candidateItems(
  state: ImageState,
  filter: CandidateFilter
): CandidateItem[] {
  const items = state.targets.flatMap((target) => {
    const slots = target.slots ?? state.kinds[target.kind]?.slots ?? []
    return slots.flatMap((slot) => {
      const word =
        typeof target[slot] === 'string' ? (target[slot] as string) : ''
      if (!word) return []
      const key = keyOf(target.id, slot)
      return [
        {
          id: target.id,
          slot,
          slotName: state.slotNames?.[slot.split('#')[0]] ?? slot,
          word,
          image:
            imageOverride(target.id, slot) ??
            state.images[target.id]?.[slot] ??
            null,
          keep: Boolean(state.keep[key]),
          redo: Boolean(state.redo[key]),
        },
      ]
    })
  })
  if (filter === 'redo') return items.filter((it) => it.redo && !it.keep)
  if (filter === 'missing')
    return items.filter((it) => !it.image && !isAvatarWord(it.word))
  return items
}
