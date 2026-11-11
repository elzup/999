// 番号の編集 (代表・評価・候補) を待たせずに保存するキュー。編集画面で使う。
//
// 待機を作らない UI の原則: 押した瞬間に画面へ出し (黄 = 保存待ち)、保存は裏で
// 順に送る (緑 = 保存済み)。送っている間も他のボタンは押せる。
//
// 同じ番号への保存は、直前の保存で進んだ時刻 (expectedUpdatedAt) を前提に
// 順番に送る必要があるので、ここでは 1 本の列に並べて先頭から送る
// (代表タブの RepSaveQueue は番号ごとに独立なので並べて同時に送っている)。
// 画面に出す文書は «サーバが返した最後の文書 + まだ送っていない操作» を重ねたもの。
//
// - 代表 (rep) と同じ語の評価 (rating) は、まだ送っていない古い方を捨てて最後だけ送る
// - 失敗したら、その番号の残りの操作は同じ古い前提に立っているので捨て、読み直して戻す
import type { NumberDoc, PatchOp } from './numberApi'
import { applyOpLocally } from './numberDetail'
import type { SaveMark } from './repQueue'

type Entry = { num: string; op: PatchOp; key: string; message?: string }

type Deps = {
  send: (
    num: string,
    op: PatchOp,
    expectedUpdatedAt: string | null
  ) => Promise<NumberDoc>
  reload: (num: string) => Promise<NumberDoc>
  /** 表示が変わった (文書・保存状態) */
  onChange: () => void
  /** その番号の保存が全部終わった。message は最後に積んだ操作のもの */
  onSettled: (num: string, message?: string) => void
  onError: (num: string, message: string) => void
  /** 緑を見せておく時間 */
  savedMs?: number
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

export class NumberOpQueue {
  private base = new Map<string, NumberDoc>()
  private pending: Entry[] = []
  private running = false
  private marks = new Map<string, SaveMark>()

  constructor(private deps: Deps) {}

  /** 読み込んだ文書を受け取る。送っていない操作がある番号は、送り終わるまで手元を優先 */
  setBase(doc: NumberDoc) {
    if (this.pending.some((entry) => entry.num === doc.num)) return
    this.base.set(doc.num, doc)
    this.deps.onChange()
  }

  /** 画面に出す文書 = サーバの最後の文書 + まだ送っていない操作 */
  view(num: string): NumberDoc | null {
    const base = this.base.get(num)
    if (!base) return null
    return this.pending
      .filter((entry) => entry.num === num)
      .reduce((doc, entry) => applyOpLocally(doc, entry.op), base)
  }

  mark(num: string, key: string): SaveMark | undefined {
    return this.marks.get(`${num}:${key}`)
  }

  /** この番号で保存待ちの操作の数 */
  pendingCount(num?: string): number {
    return this.pending.filter((entry) => !num || entry.num === num).length
  }

  enqueue(num: string, ops: PatchOp[], message?: string) {
    for (const op of ops) {
      const key = opKey(op)
      if (COALESCE(key)) {
        // 送信中の先頭は残す (もう送っている)。後ろの同じ key は捨てる
        this.pending = this.pending.filter(
          (entry, i) =>
            (this.running && i === 0) || entry.num !== num || entry.key !== key
        )
      }
      this.pending.push({ num, op, key })
      this.setMark(num, key, 'pending')
    }
    // 知らせは最後の操作に付ける (付け直しの rep / rating ではなく本来の操作の文言)
    const last = this.pending[this.pending.length - 1]
    if (last && message) last.message = message
    this.deps.onChange()
    void this.run()
  }

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

  private async run() {
    if (this.running) return
    this.running = true
    while (this.pending.length > 0) {
      const head = this.pending[0]
      const base = this.base.get(head.num)
      try {
        const saved = await this.deps.send(
          head.num,
          head.op,
          base?.updatedAt ?? null
        )
        this.base.set(head.num, saved)
        this.pending.shift()
        const same = this.pending.some(
          (entry) => entry.num === head.num && entry.key === head.key
        )
        if (!same) this.setMark(head.num, head.key, 'saved')
        if (!this.pending.some((entry) => entry.num === head.num)) {
          this.deps.onSettled(head.num, head.message)
        }
      } catch (error) {
        const dropped = this.pending.filter((entry) => entry.num === head.num)
        this.pending = this.pending.filter((entry) => entry.num !== head.num)
        for (const entry of dropped) this.setMark(entry.num, entry.key, 'error')
        this.deps.onError(head.num, (error as Error).message)
        try {
          const fresh = await this.deps.reload(head.num)
          this.base.set(head.num, fresh)
        } catch {
          // 読み直しも失敗したら手元の最後のサーバ文書のまま
        }
      }
      this.deps.onChange()
    }
    this.running = false
  }

  /** テスト用: 列が空になるまで待つ */
  async idle(): Promise<void> {
    while (this.running) await new Promise((resolve) => setTimeout(resolve, 0))
  }
}
