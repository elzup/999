// 統合ビューの表示行と操作の組み立て。
// spec: .vsdd/firestore-store/specs/spec-number-detail-view.md
//
// 画面から切り離してあるのは、保存の成否と state の更新がずれていないかを
// テストで確かめるため (console/rep-state.js を分けているのと同じ理由)。

import type { NumberDoc, NumberSlot, RepPick, Rating } from './numberApi'

/** 候補スロットの並び。rep-store の SLOT_ORDER と同じ */
export const SLOT_ORDER = ['wh1', 'wh2', 'wh3', 'wm1', 'wm2', 'wm3'] as const

/** 主観評価の許容値。未評価はエントリを持たないことで表す */
export const RATING_VALUES = [-1, 0, 1, 2] as const

export type SlotRow = {
  slot: string
  word: string
  kana: string
  imageUrl?: string
  /** 画像の確定時点の語と現在の語がずれている (REQ-CON-005) */
  imageStale: boolean
  rankey?: string
  pt?: number | null
  /** 未評価は null。0 (普通) と区別する */
  rating: number | null
  /** 代表の順位。1=①, 2=②, 0=代表でない */
  repRank: number
}

const norm = (value: string | undefined) => String(value ?? '').normalize('NFC')

const sameValue = (a: { k: string; w: string }, b: { k: string; w: string }) =>
  norm(a.k) === norm(b.k) && norm(a.w) === norm(b.w)

/** 語からタグ・ラベルを落とした本体 (console-writes.js#nameOf と同じ規則) */
export function nameOf(word: string | undefined): string {
  if (!word) return ''
  return word
    .split('#')[0]
    .replace(/\s*-\w+\s*$/, '')
    .split(',')[0]
    .replace(/\([^)]*\)/g, '')
    .replace(/\s+/g, '')
    .trim()
}

export function ratingOf(doc: NumberDoc, slot: string): number | null {
  const value = doc.slots?.[slot]
  if (!value) return null
  const hit = (doc.ratings ?? []).find((rating) =>
    sameValue(rating, { k: value.kana, w: value.word })
  )
  return hit ? hit.v : null
}

export function repRankOf(doc: NumberDoc, slot: string): number {
  const value = doc.slots?.[slot]
  if (!value) return 0
  const index = (doc.rep?.picks ?? []).findIndex((pick) =>
    sameValue(pick, { k: value.kana, w: value.word })
  )
  return index < 0 ? 0 : index + 1
}

/** 1 番号ぶんの表示行。語が入っているスロットだけを SLOT_ORDER 順に返す */
export function slotRows(doc: NumberDoc): SlotRow[] {
  return SLOT_ORDER.filter((slot) => doc.slots?.[slot]).map((slot) => {
    const value = doc.slots![slot]!
    return {
      slot,
      word: value.word,
      kana: value.kana,
      imageUrl: value.imageUrl,
      imageStale: Boolean(
        value.imageUrl &&
        value.confirmedFor &&
        nameOf(value.confirmedFor) !== nameOf(value.word)
      ),
      rankey: doc.derived?.rankeyBySlot?.[slot],
      pt: doc.derived?.ptBySlot?.[slot],
      rating: ratingOf(doc, slot),
      repRank: repRankOf(doc, slot),
    }
  })
}

/**
 * 同じ値をもう一度押したら未評価に戻す (代表語コンソールと同じ操作感)。
 * 未評価と 0 は別状態なので、戻し先は 0 ではなく null。
 */
export function nextRatingValue(
  current: number | null,
  pressed: number
): number | null {
  return current === pressed ? null : pressed
}

/**
 * 代表 ① / ② のラジオ。rank の位置をこのスロットの語にする (その語が他方にいれば外す)。
 * 既にその位置にいる語をもう一度押すと外す。
 *
 * picks は ①② を詰めた配列で穴を持てないので、① が空いたら ② が繰り上がり、
 * ① が空のまま ② を押した語は ① になる。
 */
export function setRepPick(
  doc: NumberDoc,
  slot: string,
  rank: 1 | 2
): RepPick[] {
  const value = doc.slots?.[slot]
  const picks = doc.rep?.picks ?? []
  if (!value) return picks

  const target = { k: value.kana, w: value.word }
  if (picks[rank - 1] && sameValue(picks[rank - 1], target)) {
    return picks.filter((_, i) => i !== rank - 1)
  }
  const others = picks.filter((pick) => !sameValue(pick, target))
  const next =
    rank === 1 ? [target, ...others.slice(1, 2)] : [others[0], target]
  return next.filter(Boolean)
}

/** 代表 ①② の入替。2 件無いときは何もしない (REQ-NDV-002 の代表側) */
export function swapRepPicks(picks: RepPick[]): RepPick[] {
  if (picks.length < 2) return picks
  return [picks[1], picks[0], ...picks.slice(2)]
}

/**
 * 表示順のスロットを、保存する slots マップに組み直す。
 *
 * 並べ替えは «語ごと別のキーへ移す» ことなので、wh 系と wm 系それぞれの
 * 先頭から順に詰め直す。画像と確定時点の語は語に付いて回る (同じ
 * オブジェクトを運ぶ) 必要があり、キーだけ入れ替えると画像が別の語に付く。
 */
export function slotsFromRows(
  rows: Array<Pick<SlotRow, 'slot' | 'word' | 'kana'> & Partial<SlotRow>>,
  source: NumberDoc
): Record<string, NumberSlot> {
  const groups: Record<'wh' | 'wm', number> = { wh: 0, wm: 0 }
  const next: Record<string, NumberSlot> = {}

  for (const row of rows) {
    const word = row.word.trim()
    const kana = row.kana.trim()
    if (!word && !kana) continue

    const family: 'wh' | 'wm' = row.slot.startsWith('wm') ? 'wm' : 'wh'
    groups[family] += 1
    if (groups[family] > 3) continue // シートの枠は各 3 つまで

    const before = source.slots?.[row.slot]
    next[`${family}${groups[family]}`] = {
      ...before,
      word,
      kana,
      imageUrl: row.imageUrl ?? before?.imageUrl ?? '',
    }
  }
  return next
}

/**
 * 保存済みの行に、未保存の編集を重ねた表示行。
 *
 * 保存済みスロットを走査するだけだと、«候補を追加» で作った新しいスロットの
 * draft がどこにも現れず、追加が効かないように見える (実際に踏んだ)。
 * draft にしか無いスロットも SLOT_ORDER の位置に混ぜる。
 */
export function mergeDraftRows(
  saved: SlotRow[],
  drafts: Record<string, SlotRow>
): SlotRow[] {
  const bySlot = new Map(saved.map((row) => [row.slot, row]))
  for (const [slot, draft] of Object.entries(drafts)) bySlot.set(slot, draft)

  return SLOT_ORDER.filter((slot) => bySlot.has(slot)).map(
    (slot) => bySlot.get(slot) as SlotRow
  )
}

/**
 * 1 行ぶんの編集を下書きに重ねる。まだ下書きの無い保存済みの行は、その行を土台にする。
 * 差分だけを入れると slot や kana が抜けた行になり、key が変わって入力欄が作り直される
 * (1 文字目でフォーカスが外れ、以降の入力が別キーに落ちて反映されない)。
 */
export function applyDraftEdit(
  drafts: Record<string, SlotRow>,
  row: SlotRow,
  patch: Partial<SlotRow>
): Record<string, SlotRow> {
  return { ...drafts, [row.slot]: { ...(drafts[row.slot] ?? row), ...patch } }
}

/** 配列内の 1 件を別の位置へ移す (ドラッグの結果そのもの) */
export function moveItem<T>(list: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= list.length) return list
  const next = [...list]
  const [moved] = next.splice(from, 1)
  next.splice(Math.min(to, next.length), 0, moved)
  return next
}

export type SlotFamily = 'wh' | 'wm'

/**
 * 人 (wh) / 物 (wm) の指定した側で次に使える枠。各 3 つまで、埋まっていれば null。
 * 件数 + 1 で名付けると wh1・wh3 だけ残っているときに wh3 と衝突するので、空いている番号を探す。
 */
export function nextFreeSlot(
  rows: SlotRow[],
  family: SlotFamily
): string | null {
  const used = new Set(rows.map((row) => row.slot))
  const free = [1, 2, 3].find((i) => !used.has(`${family}${i}`))
  return free === undefined ? null : `${family}${free}`
}

export type DetailState = {
  doc: NumberDoc | null
  status: string
  saving: boolean
}

/**
 * 保存が成功したときだけ文書を差し替える (REQ-NDV-007)。
 * 失敗しても画面が更新されて「保存できたように見える」ことを防ぐ。
 */
export function applySaved(
  state: DetailState,
  saved: NumberDoc | null,
  message = '保存しました'
): DetailState {
  if (!saved) return state
  return { doc: saved, status: message, saving: false }
}

export function applyFailure(state: DetailState, error: unknown): DetailState {
  const message = error instanceof Error ? error.message : '保存に失敗しました'
  return { ...state, status: message, saving: false }
}

/** 未評価を除いた評価済み件数。進捗表示用 */
export function ratedCount(doc: NumberDoc): number {
  return slotRows(doc).filter((row) => row.rating !== null).length
}

export type { NumberDoc, Rating }
