// 代表の変更を «待たせずに» 保存するキュー。
//
// 待機を作らない UI の原則: タップした瞬間に画面へ反映し (黄 = 保存待ち)、
// 保存は裏で送る (緑 = 保存済み)。送っている間も他の番号は押せる。
//
// - 同じ番号を続けて押したら、最後の状態だけを送る (途中の状態は送らない)
// - 溜まった変更は 1 回の flush でまとめて送る (番号ごとの PATCH を並べて投げる)
// - 送信中の番号をさらに押したら、その返事を待って次を送る。読んだ時点
//   (expectedUpdatedAt) は直前の返事のものを使うので、自分の保存とは衝突しない
// - 失敗したらその番号を読み直して、画面を実際の値に戻す (赤 = 失敗)
//
// 画面 (Preact) から切り離してあるのは、まとめ方と時刻の受け渡しをテストで確かめるため。
import type { NumberDoc, RepPick } from './numberApi'

export type RepChange = { picks: RepPick[]; confirmed: boolean }
export type SaveMark = 'pending' | 'saved' | 'error'

type Deps = {
  send: (
    num: string,
    change: RepChange,
    expectedUpdatedAt: string | null
  ) => Promise<NumberDoc>
  reload: (num: string) => Promise<NumberDoc>
  /** 保存の返事 (または失敗後に読み直した値)。again = この番号の次の変更が待っている */
  onSaved: (doc: NumberDoc, again: boolean) => void
  onMark: (num: string, mark: SaveMark) => void
  onError: (num: string, message: string) => void
  /** 押してから送るまで待つ時間。続けて押した分を 1 回にまとめる */
  delayMs?: number
}

export class RepSaveQueue {
  private queue = new Map<string, RepChange>()
  private inflight = new Set<string>()
  private serverAt = new Map<string, string | null>()
  private timer: ReturnType<typeof setTimeout> | null = null

  constructor(private deps: Deps) {}

  /** doc は画面に出ている (楽観的に書き換える前の) 値 */
  enqueue(doc: NumberDoc, change: RepChange) {
    // 送信中でなければ、画面の doc が最後に知っているサーバの時刻
    if (!this.inflight.has(doc.num)) {
      this.serverAt.set(doc.num, doc.updatedAt ?? null)
    }
    this.queue.set(doc.num, change)
    this.deps.onMark(doc.num, 'pending')
    this.schedule(this.deps.delayMs ?? 300)
  }

  /** この番号の変更がまだ保存されていない (待ち・送信中) */
  has(num: string): boolean {
    return this.queue.has(num) || this.inflight.has(num)
  }

  /** 保存待ち・送信中の番号の数 */
  get pendingCount(): number {
    return new Set([...this.queue.keys(), ...this.inflight]).size
  }

  private schedule(ms: number) {
    if (this.timer) clearTimeout(this.timer)
    this.timer = setTimeout(() => {
      this.timer = null
      void this.flush()
    }, ms)
  }

  /** 溜まっている変更をまとめて送る。送信中の番号は返事を待ってから次の flush で送る */
  async flush(): Promise<void> {
    const batch = [...this.queue].filter(([num]) => !this.inflight.has(num))
    if (batch.length === 0) return
    for (const [num] of batch) {
      this.queue.delete(num)
      this.inflight.add(num)
    }
    await Promise.all(batch.map(([num, change]) => this.sendOne(num, change)))
    if (this.queue.size > 0) await this.flush()
  }

  private async sendOne(num: string, change: RepChange) {
    try {
      const saved = await this.deps.send(
        num,
        change,
        this.serverAt.get(num) ?? null
      )
      this.serverAt.set(num, saved.updatedAt ?? null)
      const again = this.queue.has(num)
      this.deps.onSaved(saved, again)
      if (!again) this.deps.onMark(num, 'saved')
    } catch (error) {
      // 後ろに積んだ変更も同じ古い前提に立っているので捨てて、実際の値に戻す
      this.queue.delete(num)
      this.deps.onMark(num, 'error')
      this.deps.onError(num, (error as Error).message)
      try {
        const fresh = await this.deps.reload(num)
        this.serverAt.set(num, fresh.updatedAt ?? null)
        this.deps.onSaved(fresh, false)
      } catch {
        // 読み直しも失敗したら画面はそのまま (次に百の位を開いたとき読み直す)
      }
    } finally {
      this.inflight.delete(num)
    }
  }
}
