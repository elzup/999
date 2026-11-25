// 画像のピッカーの保存キュー。番号の保存キュー (opQueue.ts) と同じく «待機を作らない» ための口。
//
// 保存は «確定を外す → 選んだ画像を採用 → 切り抜き → 確定» の 4 回の通信になる。
// 以前はピッカーがこれを全部待ってから閉じていて、終わるまで閉じられなかった。
// - 押した瞬間に選んだ画像を画面へ出し (override)、ピッカーは閉じる
// - 通信は裏で順に送る。圏外・タイムアウト・5xx は間隔を空けて送り直し、捨てない
// - 積んだ保存は端末 (localStorage) にも書き、閉じても再読み込みしても続きから送る
// - 送り直しても通らないもの (4xx) だけ赤 (失敗) にして残す
// - 同じ枠は 1 列に並べ、違う枠は同時に送る
import { useEffect, useState } from 'preact/hooks'
import type { CropPosition, SlotImage } from './imagePicker'
import type { CropRect } from './cropRect'

export type ImageCrop = { rect: CropRect } | { position: CropPosition }

/** 保存 1 件。stage は次に送る段 (済んだ段は送り直さない) */
export type ImageSaveJob = {
  id: string
  slot: string
  /** 候補から選んだ画像。今の画像のままなら無し */
  pick?: SlotImage
  /** 決めた切り抜き。自動のままなら無し */
  crop?: ImageCrop
  /** «これで良い» (今の画像を確定するだけ) */
  keepOnly?: boolean
  stage?: Stage
}

type Stage = 'unlock' | 'pick' | 'crop' | 'keep'

export type ImageSaveMark =
  | { state: 'pending' }
  | { state: 'saved' }
  | { state: 'error'; message: string }

export type ImageSaveApi = {
  setKeep: (id: string, slot: string, on: boolean) => Promise<unknown>
  pick: (id: string, slot: string, hash: string) => Promise<SlotImage>
  recrop: (id: string, slot: string, crop: ImageCrop) => Promise<SlotImage>
}

type Deps = {
  api: ImageSaveApi
  /** サーバが返した画像 (切り抜き後の URL) を画面へ反映する */
  onImage: (id: string, slot: string, image: SlotImage) => void
  onChange?: () => void
  /** 送り直しても通らないか (4xx)。既定は «送り直す» */
  isFatal?: (error: unknown) => boolean
  storage?: { load: () => string | null; save: (text: string) => void }
  backoffMs?: (attempt: number) => number
  savedMs?: number
}

export const keyOf = (id: string, slot: string) => `${id}:${slot}`

/** 送る段の並び。«確定を外す» は外れていても害が無いので、確定済みかを覚えずに毎回送る */
export function stagesOf(job: ImageSaveJob): Stage[] {
  if (job.keepOnly) return ['keep']
  return [
    'unlock',
    ...(job.pick ? (['pick'] as const) : []),
    ...(job.crop ? (['crop'] as const) : []),
    'keep',
  ]
}

const defaultBackoff = (attempt: number) =>
  Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1))

export class ImageSaveQueue {
  private lanes = new Map<string, ImageSaveJob[]>()
  private running = new Set<string>()
  private marks = new Map<string, ImageSaveMark>()
  private attempts = new Map<string, number>()
  private timers = new Map<string, ReturnType<typeof setTimeout>>()

  constructor(private deps: Deps) {
    this.restore()
  }

  /** 積む。同じ枠でまだ送り始めていない保存は、新しい方で置き換える */
  enqueue(job: ImageSaveJob) {
    const key = keyOf(job.id, job.slot)
    const lane = this.lanes.get(key) ?? []
    const head = this.running.has(key) ? lane.slice(0, 1) : []
    this.lanes.set(key, [...head, { ...job, stage: undefined }])
    this.marks.set(key, { state: 'pending' })
    this.attempts.delete(key)
    this.persist()
    this.changed()
    this.kick(key)
  }

  mark(id: string, slot: string): ImageSaveMark | undefined {
    return this.marks.get(keyOf(id, slot))
  }

  /** 待っている送り直しを今すぐ送る (オンラインに戻ったとき) */
  retryNow() {
    for (const [key, timer] of this.timers) {
      clearTimeout(timer)
      this.timers.delete(key)
      this.kick(key)
    }
  }

  /** テスト用: 全部送り終わるまで待つ */
  async idle(): Promise<void> {
    while (this.running.size > 0) {
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  private kick(key: string) {
    if (this.running.has(key) || this.timers.has(key)) return
    const job = this.lanes.get(key)?.[0]
    if (!job) return
    this.running.add(key)
    void this.run(key, job)
  }

  private async run(key: string, job: ImageSaveJob) {
    const stages = stagesOf(job)
    let at = job.stage ? stages.indexOf(job.stage) : 0
    if (at < 0) at = 0
    try {
      for (; at < stages.length; at++) {
        job.stage = stages[at]
        this.persist()
        await this.send(job, stages[at])
      }
      this.finish(key)
    } catch (error) {
      this.running.delete(key)
      if (this.deps.isFatal?.(error)) {
        // 通らない保存は捨てる (同じ枠の後ろの保存は続けて送る)。赤にして理由を残す
        this.lanes.set(key, (this.lanes.get(key) ?? []).slice(1))
        const message =
          error instanceof Error ? error.message : '保存できません'
        this.marks.set(key, { state: 'error', message })
        this.persist()
        this.changed()
        this.kick(key)
        return
      }
      const attempt = (this.attempts.get(key) ?? 0) + 1
      this.attempts.set(key, attempt)
      const wait = (this.deps.backoffMs ?? defaultBackoff)(attempt)
      this.timers.set(
        key,
        setTimeout(() => {
          this.timers.delete(key)
          this.kick(key)
        }, wait)
      )
      this.changed()
    }
  }

  private async send(job: ImageSaveJob, stage: Stage) {
    const { api, onImage } = this.deps
    switch (stage) {
      case 'unlock':
        await api.setKeep(job.id, job.slot, false)
        return
      case 'pick':
        onImage(
          job.id,
          job.slot,
          await api.pick(job.id, job.slot, job.pick!.hash)
        )
        return
      case 'crop':
        onImage(job.id, job.slot, await api.recrop(job.id, job.slot, job.crop!))
        return
      case 'keep':
        await api.setKeep(job.id, job.slot, true)
        return
    }
  }

  private finish(key: string) {
    this.running.delete(key)
    this.attempts.delete(key)
    const rest = (this.lanes.get(key) ?? []).slice(1)
    if (rest.length > 0) {
      this.lanes.set(key, rest)
      this.persist()
      this.kick(key)
      return
    }
    this.lanes.delete(key)
    this.persist()
    this.marks.set(key, { state: 'saved' })
    this.changed()
    // 緑は少しだけ見せて消す
    setTimeout(() => {
      if (this.marks.get(key)?.state !== 'saved') return
      this.marks.delete(key)
      this.changed()
    }, this.deps.savedMs ?? 1500)
  }

  private changed() {
    this.deps.onChange?.()
  }

  private persist() {
    const jobs = [...this.lanes.values()].flat()
    try {
      this.deps.storage?.save(JSON.stringify(jobs))
    } catch {
      /* 端末に書けなくてもメモリの分は送る */
    }
  }

  private restore() {
    let jobs: ImageSaveJob[] = []
    try {
      jobs = JSON.parse(this.deps.storage?.load() ?? '[]')
    } catch {
      jobs = []
    }
    if (!Array.isArray(jobs)) return
    for (const job of jobs) {
      if (!job?.id || !job?.slot) continue
      const key = keyOf(job.id, job.slot)
      this.lanes.set(key, [...(this.lanes.get(key) ?? []), job])
      this.marks.set(key, { state: 'pending' })
    }
    for (const key of this.lanes.keys()) this.kick(key)
  }
}

// ── アプリで 1 本だけ持つ ──

// 共有のキューは imagePicker.ts#imageSaveQueue が作る (API を持つのは向こう)
const listeners = new Set<() => void>()

export const notifyImageSave = () => listeners.forEach((fn) => fn())

/** 枠の保存の状態 (黄 = 保存待ち / 緑 = 保存済み / 赤 = 失敗)。無ければ undefined */
export function useImageSaveMark(
  queue: ImageSaveQueue | null,
  id: string,
  slot: string
) {
  const [mark, setMark] = useState(() => queue?.mark(id, slot))
  useEffect(() => {
    const update = () => setMark(queue?.mark(id, slot))
    update()
    listeners.add(update)
    return () => {
      listeners.delete(update)
    }
  }, [queue, id, slot])
  return mark
}
