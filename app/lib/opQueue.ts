// 番号への書き込み (代表・評価・候補・画像・別の番号へ移す) をすべて通す保存キュー。
// アプリで 1 本だけ持つ (writeQueue.ts)。代表タブも編集画面もここに積む。
//
// 待機を作らない UI の原則:
// - 押した瞬間に積み、画面へ反映して黄 (保存待ち) にする。どのボタンもロックしない
// - 画面に出す文書 = サーバが返した最後の文書 + まだ送っていない操作
// - 送れたら緑。ネットワークがどんなに悪くても捨てない: 圏外・タイムアウト・5xx は
//   黄のまま積んでおき、間隔を空けて送り直す (オンラインに戻ったらすぐ)
// - 積んだ操作は端末 (localStorage) にも書く。閉じても再読み込みしても続きから送る
// - 赤 (失敗) にするのは送り直しても通らないものだけ (409 衝突・4xx)。そのときは
//   読み直し、サーバがすでに押したとおりなら (前の送信が届いていた) 成功とみなす
//
// 送り方: 番号ごとに 1 列 (同じ番号は直前の返事の時刻 expectedUpdatedAt を前提に順に送る)、
// 違う番号は同時に送る (まとめて確定した 48 件は並べて送る)。
import { ApiError, isRetryable } from './numberApi'
import type { NumberDoc, PatchOp } from './numberApi'
import {
  applyOpLocally,
  planMove,
  sameValue,
  type MovePlan,
} from './numberDetail'

export type SaveMark = 'pending' | 'saved' | 'error'

type OkPlan = Extract<MovePlan, { ok: true }>

/**
 * 別の番号へ移す。2 番号にまたがるので段に分けて進め、どこまで済んだかを持つ
 * (途中で通信が切れても、済んだ段は繰り返さない)。
 * 段: 計画 (移動先を読む) → 移動先に足す → 移動先の評価 → 移動元から抜く → 移動元の代表
 */
export type MoveSpec = {
  row: { slot: string; imageUrl?: string }
  to: string
  plan?: OkPlan
  targetAt?: string | null
  stage?: 'target' | 'rating' | 'source' | 'rep' | 'done'
}

type Entry = {
  id: number
  num: string
  key: string
  message?: string
  op?: PatchOp
  move?: MoveSpec
  /** 今送っている (まとめる対象から外す) */
  sending?: boolean
}

type Deps = {
  send: (
    num: string,
    op: PatchOp,
    expectedUpdatedAt: string | null
  ) => Promise<NumberDoc>
  read: (num: string) => Promise<NumberDoc>
  /** 表示が変わった (文書・保存状態) */
  onChange: () => void
  /** その番号の保存が全部終わった。message は最後に積んだ操作のもの */
  onSettled: (num: string, message?: string) => void
  onError: (num: string, message: string) => void
  /** 積んだ操作を端末に残す (無ければメモリだけ) */
  storage?: { load: () => string | null; save: (text: string) => void }
  /** 緑を見せておく時間 */
  savedMs?: number
  /** n 回目の送り直しまで待つ時間 */
  backoffMs?: (attempt: number) => number
}

/** 何の保存か。同じ key は最後だけ送る / 黄緑の印を付ける単位 */
export function opKey(op: PatchOp): string {
  switch (op.op) {
    case 'rep':
      return 'rep'
    case 'rating':
      return `rating:${op.k}|${op.w}`
    case 'slots':
      return 'slots'
    case 'image':
      return `image:${op.slot}`
  }
}

const COALESCE = (key: string) => key === 'rep' || key.startsWith('rating:')
// 同時に送る番号の数。まとめて確定した数十件を一度に投げない
const MAX_LANES = 6
const defaultBackoff = (attempt: number) =>
  Math.min(30_000, 1000 * 2 ** Math.max(0, attempt - 1))

/** 移す操作を手元の文書に当てる (移動元から語を抜く) */
function applyMoveLocally(doc: NumberDoc, move: MoveSpec): NumberDoc {
  if (move.plan) {
    const moved = applyOpLocally(doc, {
      op: 'slots',
      slots: move.plan.sourceSlots,
    })
    return move.plan.sourceRep
      ? applyOpLocally(moved, { op: 'rep', ...move.plan.sourceRep })
      : moved
  }
  if (!doc.slots?.[move.row.slot]) return doc
  const { [move.row.slot]: _, ...rest } = doc.slots
  return { ...doc, slots: rest }
}

/** サーバの文書がすでにこの操作のとおりか (前の送信が届いていて返事だけ落ちた) */
export function alreadyApplied(doc: NumberDoc, op: PatchOp): boolean {
  switch (op.op) {
    case 'rep':
      return (
        Boolean(doc.rep?.confirmed) === op.confirmed &&
        (doc.rep?.picks ?? []).length === op.picks.length &&
        op.picks.every((pick, i) => sameValue(pick, doc.rep!.picks[i]))
      )
    case 'rating': {
      const hit = (doc.ratings ?? []).find((r) =>
        sameValue(r, { k: op.k, w: op.w })
      )
      return op.v === null ? !hit : hit?.v === op.v
    }
    case 'slots': {
      const pack = (slots: NumberDoc['slots']) =>
        JSON.stringify(
          Object.entries(slots ?? {})
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([slot, v]) => [slot, v.word, v.kana])
        )
      return pack(doc.slots) === pack(op.slots)
    }
    case 'image': {
      const slot = doc.slots?.[op.slot]
      return op.tag
        ? slot?.tagImages?.[op.tag] === op.imageUrl
        : slot?.imageUrl === op.imageUrl
    }
  }
}

type Persisted = {
  entries: Array<Omit<Entry, 'id' | 'sending'>>
  expected: Record<string, string | null>
}

export class NumberOpQueue {
  private base = new Map<string, NumberDoc>()
  /** 番号ごとの «サーバの最後の時刻»。送るときの前提 (expectedUpdatedAt) */
  private expected = new Map<string, string | null>()
  private pending: Entry[] = []
  private lanes = new Set<string>()
  private attempts = new Map<string, number>()
  private marks = new Map<string, SaveMark>()
  private retryTimer: ReturnType<typeof setTimeout> | null = null
  private nextId = 1

  constructor(private deps: Deps) {
    this.restore()
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.kick())
    }
    if (this.pending.length) setTimeout(() => this.kick(), 0)
  }

  // ---- 読み込んだ文書 ----

  /** 読み込んだ文書を受け取る。送っていない操作がある番号は、その前提 (時刻) を変えない */
  setBase(doc: NumberDoc) {
    const busy = this.pending.some((entry) => entry.num === doc.num)
    if (!busy || !this.base.has(doc.num)) this.base.set(doc.num, doc)
    if (!busy || !this.expected.has(doc.num)) {
      this.expected.set(doc.num, doc.updatedAt ?? null)
    }
    this.deps.onChange()
  }

  /** 先読みした文書を入れる。まだ持っていない番号だけ */
  seed(docs: NumberDoc[]) {
    let changed = false
    for (const doc of docs) {
      if (this.base.has(doc.num)) continue
      this.base.set(doc.num, doc)
      if (!this.expected.has(doc.num)) {
        this.expected.set(doc.num, doc.updatedAt ?? null)
      }
      changed = true
    }
    if (changed) this.deps.onChange()
  }

  has(num: string): boolean {
    return this.base.has(num)
  }

  /** 画面に出す文書 = サーバの最後の文書 + まだ送っていない操作 */
  view(num: string): NumberDoc | null {
    const base = this.base.get(num)
    if (!base) return null
    return this.pending
      .filter((entry) => entry.num === num)
      .reduce(
        (doc, entry) =>
          entry.op
            ? applyOpLocally(doc, entry.op)
            : applyMoveLocally(doc, entry.move!),
        base
      )
  }

  mark(num: string, key: string): SaveMark | undefined {
    return this.marks.get(`${num}:${key}`)
  }

  /** 保存待ちの操作の数 (num を渡せばその番号だけ) */
  pendingCount(num?: string): number {
    return this.pending.filter((entry) => !num || entry.num === num).length
  }

  /** 送り直しを待っている (通信できていない) か */
  get retrying(): boolean {
    return this.retryTimer !== null
  }

  // ---- 積む ----

  enqueue(num: string, ops: PatchOp[], message?: string) {
    for (const op of ops) {
      const key = opKey(op)
      if (COALESCE(key)) {
        // 送信中のものは残す (もう送っている)。まだ送っていない同じ key は捨てる
        this.pending = this.pending.filter(
          (entry) => entry.sending || entry.num !== num || entry.key !== key
        )
      }
      this.pending.push({ id: this.nextId++, num, op, key })
      this.setMark(num, key, 'pending')
    }
    this.finishEnqueue(message)
  }

  /** 別の番号へ移す。前に積んだ操作のあとに続けて実行する */
  enqueueMove(num: string, move: MoveSpec, message?: string) {
    this.pending.push({ id: this.nextId++, num, key: 'slots', move })
    this.setMark(num, 'slots', 'pending')
    this.finishEnqueue(message)
  }

  private finishEnqueue(message?: string) {
    // 知らせは最後の操作に付ける (付け直しの rep / rating ではなく本来の操作の文言)
    const last = this.pending[this.pending.length - 1]
    if (last && message) last.message = message
    this.persist()
    this.deps.onChange()
    this.kick()
  }

  // ---- 送る ----

  private kick() {
    if (this.retryTimer) {
      clearTimeout(this.retryTimer)
      this.retryTimer = null
    }
    for (const entry of this.pending) {
      if (this.lanes.size >= MAX_LANES) break
      if (!this.lanes.has(entry.num)) void this.runLane(entry.num)
    }
  }

  private retryLater() {
    if (this.retryTimer) return
    const attempt = Math.max(1, ...this.attempts.values())
    this.retryTimer = setTimeout(
      () => {
        this.retryTimer = null
        this.kick()
      },
      (this.deps.backoffMs ?? defaultBackoff)(attempt)
    )
  }

  private accept(doc: NumberDoc) {
    this.base.set(doc.num, doc)
    this.expected.set(doc.num, doc.updatedAt ?? null)
  }

  private remove(entry: Entry) {
    this.pending = this.pending.filter((other) => other.id !== entry.id)
  }

  private async runLane(num: string) {
    this.lanes.add(num)
    let failed = false
    let lastMessage: string | undefined
    for (;;) {
      const head = this.pending.find((entry) => entry.num === num)
      if (!head) break
      head.sending = true
      try {
        if (head.op) {
          this.accept(
            await this.deps.send(num, head.op, this.expected.get(num) ?? null)
          )
        } else {
          await this.runMove(num, head.move!)
        }
        this.remove(head)
        this.attempts.delete(num)
        lastMessage = head.message ?? lastMessage
        if (!this.pending.some((e) => e.num === num && e.key === head.key)) {
          this.setMark(num, head.key, 'saved')
        }
      } catch (error) {
        head.sending = false
        if (isRetryable(error)) {
          // 捨てない。黄のまま積んでおき、間隔を空けて送り直す
          this.attempts.set(num, (this.attempts.get(num) ?? 0) + 1)
          this.persist()
          this.deps.onChange()
          this.lanes.delete(num)
          this.retryLater()
          return
        }
        // 送り直しても通らない (409 など)。読み直して、すでにそのとおりなら成功とみなす
        let fresh: NumberDoc | null = null
        try {
          fresh = await this.deps.read(num)
        } catch {
          fresh = null
        }
        if (fresh && head.op && alreadyApplied(fresh, head.op)) {
          this.accept(fresh)
          this.remove(head)
          this.setMark(num, head.key, 'saved')
        } else {
          // 残りも同じ古い前提に立っているので捨てて、実際の値に戻す
          const dropped = this.pending.filter((entry) => entry.num === num)
          this.pending = this.pending.filter((entry) => entry.num !== num)
          for (const entry of dropped) this.setMark(num, entry.key, 'error')
          if (fresh) this.accept(fresh)
          this.deps.onError(num, (error as Error).message)
          failed = true
        }
      }
      this.persist()
      this.deps.onChange()
    }
    this.lanes.delete(num)
    if (!failed) this.deps.onSettled(num, lastMessage)
    this.deps.onChange()
    // 同時に送れる数の上限で待っていた番号を送る
    if (this.pending.some((entry) => !this.lanes.has(entry.num))) this.kick()
  }

  private async runMove(num: string, move: MoveSpec) {
    if (!move.plan) {
      const source = this.base.get(num) ?? (await this.deps.read(num))
      const target = await this.deps.read(move.to)
      const plan = planMove(source, move.row, target)
      if (!plan.ok) throw new ApiError(plan.error, 400, false)
      move.plan = plan
      move.targetAt = target.updatedAt ?? null
      move.stage = 'target'
      this.persist()
    }
    const plan = move.plan
    if (move.stage === 'target') {
      const saved = await this.deps.send(
        move.to,
        { op: 'slots', slots: plan.targetSlots },
        move.targetAt ?? null
      )
      move.targetAt = saved.updatedAt ?? null
      if (this.base.has(move.to)) this.accept(saved)
      move.stage = plan.rating ? 'rating' : 'source'
      this.persist()
    }
    if (move.stage === 'rating' && plan.rating) {
      const saved = await this.deps.send(
        move.to,
        { op: 'rating', ...plan.rating },
        move.targetAt ?? null
      )
      if (this.base.has(move.to)) this.accept(saved)
      move.stage = 'source'
      this.persist()
    }
    if (move.stage === 'source') {
      this.accept(
        await this.deps.send(
          num,
          { op: 'slots', slots: plan.sourceSlots },
          this.expected.get(num) ?? null
        )
      )
      move.stage = plan.sourceRep ? 'rep' : 'done'
      this.persist()
    }
    if (move.stage === 'rep' && plan.sourceRep) {
      this.accept(
        await this.deps.send(
          num,
          { op: 'rep', ...plan.sourceRep },
          this.expected.get(num) ?? null
        )
      )
      move.stage = 'done'
    }
  }

  // ---- 印・端末への保存 ----

  private setMark(num: string, key: string, mark: SaveMark) {
    this.marks.set(`${num}:${key}`, mark)
    if (mark === 'saved') {
      setTimeout(() => {
        if (this.marks.get(`${num}:${key}`) !== 'saved') return
        this.marks.delete(`${num}:${key}`)
        this.deps.onChange()
      }, this.deps.savedMs ?? 1500)
    }
  }

  private persist() {
    if (!this.deps.storage) return
    const data: Persisted = {
      entries: this.pending.map(({ num, key, message, op, move }) => ({
        num,
        key,
        message,
        op,
        move,
      })),
      // 積んでいる番号の前提の時刻だけ残す
      expected: Object.fromEntries(
        [...new Set(this.pending.map((entry) => entry.num))].map((num) => [
          num,
          this.expected.get(num) ?? null,
        ])
      ),
    }
    try {
      this.deps.storage.save(JSON.stringify(data))
    } catch {
      // 端末に書けなくてもメモリでは送り続ける
    }
  }

  private restore() {
    if (!this.deps.storage) return
    try {
      const text = this.deps.storage.load()
      if (!text) return
      const data = JSON.parse(text) as Persisted
      for (const [num, at] of Object.entries(data.expected ?? {})) {
        this.expected.set(num, at)
      }
      for (const entry of data.entries ?? []) {
        this.pending.push({ ...entry, id: this.nextId++ })
        this.marks.set(`${entry.num}:${entry.key}`, 'pending')
      }
    } catch {
      // 壊れていたら読まない (送れないものを抱えたままにしない)
    }
  }
}
