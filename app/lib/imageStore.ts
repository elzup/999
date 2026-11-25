// 語の画像の状態を 1 か所に持つストア (zustand の vanilla ストア + Preact 用の購読フック)。
//
// 以前は画像の出どころが画面ごとにばらばらで、同じ語でも画面によって違う画像が出ていた:
//   配信データ (data.json, デプロイ時点) / DB の slots.imageUrl / 画像タブが読む imageSlots /
//   モジュール変数の «選び直した画像» / 画像タブが自前の state に写した画像
// ここでは状態を次の 3 つに分けて 1 つのストアに置き、どの画面も slotImageOf で同じ順に引く。
//   picked  … この端末で選んだ画像 (保存キューが送り終えるまでの間も、送った後のサーバの画像も)
//   server  … 画像の正本 imageSlots の画像 (/api/console/state)。選んだときの語も持つ
//   saves   … 保存キューの状態 (黄 = 保存待ち / 緑 = 保存済み / 赤 = 失敗)
// 書き換えはここの action だけが行い、画面は selector で読むだけにする (一方向のデータの流れ)。
import { createStore } from 'zustand/vanilla'
import { useEffect, useRef, useState } from 'preact/hooks'
import type { SlotImage } from './imagePicker'
import type { ImageSaveMark } from './imageSaveQueue'

export type SlotKey = string

/** 画像は «対象 id : 画像の枠名» (282:w1、タグ違いは 282:w1#res) で持つ */
export const slotKeyOf = (id: string, slot: string): SlotKey => `${id}:${slot}`

/** 選んだとき (取ったとき) の語。画像は枠の位置で持つので、語が違えば当てない */
type WordImage = { image: SlotImage; word?: string }

export type ImageStoreState = {
  picked: Record<SlotKey, WordImage>
  server: Record<SlotKey, WordImage>
  /** server を読み込んだか (読む前は配信データの画像だけで出す) */
  serverLoaded: boolean
  saves: Record<SlotKey, ImageSaveMark>
}

export type ImageStoreActions = {
  /** この端末で画像を選んだ (word を省くと、その枠で前に覚えた語のまま画像だけ差し替える) */
  pick: (id: string, slot: string, image: SlotImage, word?: string) => void
  /** imageSlots の画像を入れ直す (画像タブ・起動時の読み込み) */
  loadServer: (
    images: Record<string, Record<string, SlotImage>>,
    words?: Record<SlotKey, { word?: string } | undefined>
  ) => void
  /** 保存キューの状態を写す */
  setSaves: (saves: Record<SlotKey, ImageSaveMark>) => void
}

export type ImageStore = ImageStoreState & ImageStoreActions

const initial: ImageStoreState = {
  picked: {},
  server: {},
  serverLoaded: false,
  saves: {},
}

export const createImageStore = () =>
  createStore<ImageStore>()((set) => ({
    ...initial,
    pick: (id, slot, image, word) =>
      set((state) => {
        const key = slotKeyOf(id, slot)
        return {
          picked: {
            ...state.picked,
            [key]: { image, word: word ?? state.picked[key]?.word },
          },
        }
      }),
    loadServer: (images, words = {}) =>
      set(() => {
        const server: Record<SlotKey, WordImage> = {}
        for (const [id, slots] of Object.entries(images)) {
          for (const [slot, image] of Object.entries(slots)) {
            if (!image?.url) continue
            const key = slotKeyOf(id, slot)
            server[key] = { image, word: words[key]?.word }
          }
        }
        return { server, serverLoaded: true }
      }),
    setSaves: (saves) => set(() => ({ saves })),
  }))

/** アプリで 1 つだけ持つストア */
export const imageStore = createImageStore()

// ── selector ──

/** 語の本体 (タグ・ラベルを落とす)。画面によってタグの持ち方が違っても同じ語として比べる */
export const baseWord = (word: string) =>
  word
    .split('#')[0]
    .replace(/\s+-\w+/g, '')
    .trim()

const sameWord = (a: string | undefined, b: string | undefined) =>
  a === undefined || b === undefined || baseWord(a) === baseWord(b)

/**
 * 1 枠に出す画像。どの画面もこの順で引く:
 *   1. この端末で選んだ画像 (その語で選んだもの)
 *   2. imageSlots の画像 (その語で取ったもの。並べ替えで同じ枠に来た別の語の画像は当てない)
 *   3. 呼び出し側の画像 (DB の slots.imageUrl・配信データ。語と一緒に動く)
 */
export function slotImageOf(
  state: ImageStoreState,
  id: string,
  slot: string,
  word?: string,
  fallback?: string
): { url: string; source: 'picked' | 'server' | 'fallback' } | null {
  const key = slotKeyOf(id, slot)
  const picked = state.picked[key]
  if (picked?.image.url && sameWord(picked.word, word)) {
    return { url: picked.image.url, source: 'picked' }
  }
  const server = state.server[key]
  if (server?.image.url && sameWord(server.word, word)) {
    return { url: server.image.url, source: 'server' }
  }
  return fallback ? { url: fallback, source: 'fallback' } : null
}

/** 選んだ画像 (切り抜き用の元画像つき) か imageSlots の画像。ピッカーの «今» に使う */
export function slotImageFull(
  state: ImageStoreState,
  id: string,
  slot: string,
  word?: string
): SlotImage | undefined {
  const key = slotKeyOf(id, slot)
  const picked = state.picked[key]
  if (picked && sameWord(picked.word, word)) return picked.image
  const server = state.server[key]
  if (server && sameWord(server.word, word)) return server.image
  return undefined
}

// ── Preact から読む ──

/**
 * ストアの一部を購読する。selector の結果が変わったときだけ描き直す
 * (zustand の React 用フックは react を要るので、Preact の hooks で同じことをする)
 */
export function useImageStore<T>(
  selector: (state: ImageStore) => T,
  equal: (a: T, b: T) => boolean = Object.is
): T {
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  const [value, setValue] = useState(() => selector(imageStore.getState()))
  const valueRef = useRef(value)
  valueRef.current = value
  useEffect(() => {
    const check = (state: ImageStore) => {
      const next = selectorRef.current(state)
      if (!equal(valueRef.current, next)) {
        valueRef.current = next
        setValue(() => next)
      }
    }
    // 描画から購読までの間に変わった分も拾う
    check(imageStore.getState())
    return imageStore.subscribe(check)
  }, [])
  // selector の引数 (id / slot / word) が変わった描画では、その場で読み直す
  const now = selector(imageStore.getState())
  return equal(value, now) ? value : now
}

const sameImage = (
  a: ReturnType<typeof slotImageOf>,
  b: ReturnType<typeof slotImageOf>
) => a?.url === b?.url && a?.source === b?.source

/** 1 枠に出す画像の URL (slotImageOf の順)。無ければ undefined */
export function useSlotImage(
  id: string,
  slot: string,
  word?: string,
  fallback?: string
) {
  return useImageStore(
    (state) => slotImageOf(state, id, slot, word, fallback),
    sameImage
  )
}

/** 枠の保存の状態 */
export const useSlotSave = (id: string, slot: string) =>
  useImageStore((state) => state.saves[slotKeyOf(id, slot)])
