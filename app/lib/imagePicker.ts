// 画像ピッカー (候補タブ・詳細パネルの画像) の API と純粋なロジック。D-0088 / D-0089。
// 画像の正本は Firestore imageSlots で、読み書きは Function の /api/console/* を通す
// (functions/console-route.js。web 版の画像コンソールと同じ経路)。
//
// 配信データ (data.json) の画像は nr deploy の時点のもの。ピッカーで選んだ画像は
// 次のデプロイまで配信データに載らないので、この画面の中では overrides で上書きして見せる。
import { useEffect, useState } from 'preact/hooks'
import { buildSearchWord } from './searchWord'
import { loadEditorToken } from './editorAuth'
import {
  ImageSaveQueue,
  notifyImageSave,
  useImageSaveMark,
  type ImageSaveJob,
} from './imageSaveQueue'

export type SlotImage = {
  url: string
  hash: string
  sourcePage?: string
  sourceImageUrl?: string
  /** 取得したときに自分のバケットへ残した元画像 (元サイトが後から再取得を断ることがあるため) */
  originalUrl?: string
}

/** 切り抜きに使う元画像。残してあればそれを、無ければ元サイトの画像を使う */
export const cropSourceOf = (image: SlotImage | null | undefined) =>
  image?.originalUrl ?? image?.sourceImageUrl ?? ''

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
  /** 画像を取ったときの語と検索ワード (枠 → )。今の語と違えば «語変更» */
  candidates?: Record<string, { word?: string; query?: string }>
  /** ピッカーに出したまま選んでいない候補の数 (枠 → 数) */
  choices?: Record<string, number>
  canFetch?: boolean
}

export type CandidateResult = {
  query: string
  current: SlotImage | null
  candidates: SlotImage[]
  /** 検索せずに、前に取った候補を返した */
  reused?: boolean
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

/** 画像データの枠名 (w1_2#res) → アプリの枠名 (wh2)。番号でない対象の枠 (P / A / O) は null */
export function appSlotOf(imageSlot: string): string | null {
  const base = imageSlot.split('#')[0]
  const hit = Object.entries(IMAGE_SLOT_OF).find(([, image]) => image === base)
  return hit ? hit[0] : null
}

/** 画像の枠名。タグ違いで分けた語は «旧スロット#タグ» (D-0041) */
export const imageSlotOf = (slot: string, variant?: string) =>
  (IMAGE_SLOT_OF[slot] ?? slot) + (variant ? `#${variant}` : '')

// 候補は検索と 10 枚の DL を待つので、番号の API (15 秒) より長く待つ。
// Hosting から Function への転送が 60 秒で切れるので、それより少し長く
const TIMEOUT_MS = 65_000

/**
 * 画像 API の失敗。status 0 は通信できなかった (圏外・タイムアウト)。
 * 送り直しても通らないのは 4xx (408 / 429 を除く) と、サーバが ok: false で断ったもの
 */
export class ImageApiError extends Error {
  constructor(
    message: string,
    readonly status: number
  ) {
    super(message)
    this.name = 'ImageApiError'
  }
  get fatal() {
    return (
      this.status === -1 ||
      (this.status >= 400 &&
        this.status < 500 &&
        this.status !== 408 &&
        this.status !== 429)
    )
  }
}

/** 画面の «止める» で打ち切った (失敗ではない) */
export class StoppedError extends Error {
  constructor() {
    super('止めました')
    this.name = 'StoppedError'
  }
}

async function call<T>(
  path: string,
  token: string,
  body?: Record<string, unknown>,
  stop?: AbortSignal
): Promise<T> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const onStop = () => controller.abort()
  stop?.addEventListener('abort', onStop)
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
    if (stop?.aborted) throw new StoppedError()
    console.error('image api', path, err)
    throw new ImageApiError('通信できません (圏外・タイムアウト)', 0)
  } finally {
    clearTimeout(timer)
    stop?.removeEventListener('abort', onStop)
  }
  const data = await res.json().catch(() => null)
  if (!res.ok) {
    throw new ImageApiError(
      data?.error || `失敗しました (${res.status})`,
      res.status
    )
  }
  if (data && data.ok === false) {
    throw new ImageApiError(data.error || '失敗しました', -1)
  }
  return data as T
}

export const fetchImageState = (token: string) =>
  call<ImageState>('state', token)

/** 撮り直しの印を付け外す。印の付いた枠は Mac の nr images:redo-flagged がまとめて取り直す */
export const setRedo = async ({
  token,
  id,
  slot,
  on,
}: {
  token: string
  id: string
  slot: string
  on: boolean
}) =>
  (
    await call<{ redo: ImageState['redo'] }>('redo', token, {
      id,
      slot,
      on,
      reason: 'タグを展開しない検索ワードで取った画像',
    })
  ).redo

export const fetchCandidates = ({
  token,
  id,
  slot,
  query,
  auto,
  reuse,
  reuseOnly,
  stop,
}: {
  token: string
  id: string
  slot: string
  query?: string
  /** 前に取った候補が残っていれば検索せずにそれを返す */
  reuse?: boolean
  /** 語から作った検索ワード (自分で打ったものではない)。Function は自分で作り直す */
  auto?: boolean
  /** 前に取った候補を出すだけで、無ければ検索しない */
  reuseOnly?: boolean
  /** 画面の «止める»。サーバの処理は止まらないが、結果を待たずに戻る */
  stop?: AbortSignal
}) =>
  call<CandidateResult>(
    'candidates',
    token,
    {
      id,
      slot,
      ...(query ? { query } : {}),
      ...(auto ? { auto } : {}),
      ...(reuse ? { reuse } : {}),
      ...(reuseOnly ? { reuseOnly } : {}),
    },
    stop
  )

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

/** 確定 (ロック) を付け外す。ロックした枠は一括の取り直しでも上書きされない */
export const setKeep = async ({
  token,
  id,
  slot,
  on,
}: {
  token: string
  id: string
  slot: string
  on: boolean
}) =>
  (await call<{ keep: Record<string, true> }>('keep', token, { id, slot, on }))
    .keep

/** 切り抜きの寄せ方 (src/images/process.js の CROP_POSITIONS と同じ) */
export type CropPosition = 'top' | 'bottom' | 'left' | 'right' | 'centre'

export const CROP_BUTTONS: { position: CropPosition; label: string }[] = [
  { position: 'top', label: '↑ 上' },
  { position: 'bottom', label: '↓ 下' },
  { position: 'left', label: '← 左' },
  { position: 'right', label: '→ 右' },
  { position: 'centre', label: '中央' },
]

/**
 * 今の画像の元画像を、寄せ方を決めて切り抜き直す (自動の切り抜きで顔や本体が切れた画像の救済)。
 * rect (元画像に対する割合) を渡すとその範囲で切り抜く (全画面プレビューで決めた範囲)
 */
export const recropImage = async ({
  token,
  id,
  slot,
  position,
  rect,
}: {
  token: string
  id: string
  slot: string
  position?: CropPosition
  rect?: { x: number; y: number; w: number; h: number }
}) =>
  (
    await call<{ image: SlotImage }>('recrop', token, {
      id,
      slot,
      ...(position ? { position } : {}),
      ...(rect ? { rect } : {}),
    })
  ).image

/** Function がロック中の枠を断ったときの文言 (functions/console-route.js の LOCKED) */
export const isLockedError = (err: unknown) =>
  String((err as Error)?.message ?? err).startsWith('ロック中')

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

/**
 * 1 枠の今の画像 (切り抜き用の元画像つき) と確定済みか。詳細パネルは表示用の URL しか
 * 持っていないので、ピッカーを開いたときにこれで取り直す。選び直した画像があればそれを優先
 */
export async function fetchSlotState(token: string, id: string, slot: string) {
  const state = await fetchImageState(token)
  return {
    image: imageOverride(id, slot) ?? state.images[id]?.[slot] ?? null,
    kept: Boolean(state.keep[keyOf(id, slot)]),
  }
}

/**
 * 行の画像を、この画面の中で選び直した画像 (override) で差し替える。
 * 代表の一覧・カードは DB の語と配信データの画像で行を作るので、そのままでは
 * 画像タブで選び直した画像が次のデプロイまで出ない
 */
export function withImageOverrides<
  T extends { slot: string; variant?: string; imageUrl?: string },
>(
  rows: T[],
  num: string,
  lookup: (id: string, slot: string) => SlotImage | undefined = imageOverride
): T[] {
  return rows.map((row) => {
    const picked = lookup(num, imageSlotOf(row.slot, row.variant))
    return picked?.url && picked.url !== row.imageUrl
      ? { ...row, imageUrl: picked.url }
      : row
  })
}

/** 選び直した画像が変わったら描き直す (一覧のように枠が多い画面で、行ごとに購読しないため) */
export function useImageOverrides() {
  const [, bump] = useState(0)
  useEffect(() => {
    const update = () => bump((v) => v + 1)
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [])
}

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

export type CandidateFilter =
  | 'redo'
  | 'missing'
  | 'unkept'
  | 'changed'
  | 'choices'
  | 'kept'
  | 'stale'
  | 'all'

export const CANDIDATE_FILTERS: { id: CandidateFilter; label: string }[] = [
  { id: 'redo', label: '撮り直し' },
  { id: 'missing', label: '未取得' },
  { id: 'unkept', label: '未確定' },
  { id: 'changed', label: '語変更' },
  { id: 'choices', label: '候補あり' },
  { id: 'kept', label: '確定済み' },
  { id: 'stale', label: '検索語の誤り' },
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
  /** 画像を取ったときの語と今の語が違う */
  changed: boolean
  /** ピッカーに出したまま選んでいない候補の数 */
  choices: number
  /** 略語タグを正式名に展開しないまま検索して取った画像 (ミミ#pr を «ミミ pr» で探した) */
  stale: boolean
}

/** 画像を取ったときの語が分かっていて、今の語と違う (語を直したのに画像が古い) */
const isWordChanged = (fetchedFor: string | undefined, word: string) =>
  Boolean(fetchedFor) && fetchedFor !== word

// #i はアバター固定の枠 (console と同じく取り直しの対象にしない)
const isAvatarWord = (word: string) => /#i\b/.test(word)

/** 候補タブに並べる枠。対象 (番号・日付・カード) の順のまま */
/**
 * 略語タグを展開しないまま検索して取った枠か。取ったときの検索ワードが «タグを展開しない語»
 * と同じで、正式名で展開すると違う語になるもの (タグ展開の不具合のあいだに取った画像)。
 * 自分で打った検索ワードで取った枠は、どちらとも違うので当たらない
 */
export function isStaleQuery(
  query: string | undefined,
  word: string,
  tagTitles: Record<string, string>
): boolean {
  if (!query) return false
  const raw = buildSearchWord(word)
  return query === raw && buildSearchWord(word, tagTitles) !== raw
}

export function candidateItems(
  state: ImageState,
  filter: CandidateFilter,
  tagTitles: Record<string, string> = {}
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
          changed: isWordChanged(state.candidates?.[key]?.word, word),
          choices: state.choices?.[key] ?? 0,
          stale: isStaleQuery(state.candidates?.[key]?.query, word, tagTitles),
        },
      ]
    })
  })
  const canPick = (it: CandidateItem) => !isAvatarWord(it.word)
  if (filter === 'redo') return items.filter((it) => it.redo && !it.keep)
  if (filter === 'missing')
    return items.filter((it) => !it.image && canPick(it))
  if (filter === 'unkept')
    return items.filter((it) => it.image && !it.keep && canPick(it))
  if (filter === 'changed')
    return items.filter((it) => it.image && it.changed && canPick(it))
  if (filter === 'choices')
    return items.filter((it) => it.choices > 0 && !it.keep && canPick(it))
  if (filter === 'kept') return items.filter((it) => it.keep)
  // 確定済みも出す (確定していても画像が別物のことがある。解除してから取り直す)
  if (filter === 'stale')
    return items.filter((it) => it.image && it.stale && canPick(it))
  return items
}

/**
 * フィルタに当たる枠に、開いた枠 (確定などでフィルタから外れたもの) を元の並びのまま足す
 */
export function keepOpened(
  all: CandidateItem[],
  matched: CandidateItem[],
  opened: Set<string>
): CandidateItem[] {
  if (!opened.size) return matched
  const keyOf = (it: CandidateItem) => `${it.id}:${it.slot}`
  const keys = new Set(matched.map(keyOf))
  return all.filter((it) => keys.has(keyOf(it)) || opened.has(keyOf(it)))
}

// ── 保存キュー (押したら閉じて、裏で送る) ──

const SAVE_QUEUE_KEY = 'imageSaveQueue999'
let saveQueue: ImageSaveQueue | null = null

/** アプリで 1 本だけ持つ画像の保存キュー。送るときの認証は端末に保存したトークン */
export function imageSaveQueue(): ImageSaveQueue {
  if (!saveQueue) {
    saveQueue = new ImageSaveQueue({
      api: {
        setKeep: (id, slot, on) =>
          setKeep({ token: loadEditorToken(), id, slot, on }),
        pick: (id, slot, hash) =>
          pickImage({ token: loadEditorToken(), id, slot, hash }),
        recrop: (id, slot, crop) =>
          recropImage({ token: loadEditorToken(), id, slot, ...crop }),
      },
      onImage: (id, slot, image) => setImageOverride(id, slot, image),
      onChange: notifyImageSave,
      isFatal: (err) => err instanceof ImageApiError && err.fatal,
      storage: {
        load: () => {
          try {
            return localStorage.getItem(SAVE_QUEUE_KEY)
          } catch {
            return null
          }
        },
        save: (text) => localStorage.setItem(SAVE_QUEUE_KEY, text),
      },
    })
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => saveQueue?.retryNow())
    }
  }
  return saveQueue
}

/**
 * 保存を積む。選んだ画像はその場で画面に出し (サーバの切り抜き後の画像は届いたら差し替わる)、
 * 呼んだ側はすぐ閉じてよい
 */
export function queueImageSave(job: ImageSaveJob) {
  if (job.pick) setImageOverride(job.id, job.slot, job.pick)
  imageSaveQueue().enqueue(job)
}

/** 枠の保存の状態 (黄 = 保存待ち / 緑 = 保存済み / 赤 = 失敗) */
export const useImageSave = (id: string, slot: string) =>
  useImageSaveMark(imageSaveQueue(), id, slot)
