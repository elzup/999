// 保存した番号を、読み込み済みの辞書データに差し替える。
// 辞書データは deploy のときの写しなので、差し替えないと一覧・詳細・テストが次の起動まで古い語のまま出る
import { NumberEntrySchema } from '../data/schema'
import type { AppData, NumberEntry } from '../data/schema'
import type { NumberDoc } from './numberApi'

/** サーバの応答を 1 件として読む。形が合わなければ null (差し替えない) */
export function parseNumberEntry(raw: unknown): NumberEntry | null {
  const result = NumberEntrySchema.safeParse(raw)
  return result.success ? result.data : null
}

/** 同じ番号の 1 件を差し替えた辞書データを返す。無い番号・同じ中身なら元のまま */
export function withNumberEntry(data: AppData, entry: NumberEntry): AppData {
  const at = data.numbers.findIndex((item) => item.num === entry.num)
  if (at < 0) return data
  if (JSON.stringify(data.numbers[at]) === JSON.stringify(entry)) return data
  const numbers = [...data.numbers]
  numbers[at] = entry
  return { ...data, numbers }
}

/** 番号文書の枠 → 辞書データのフィールド (新しい名前と、同じ値を持つ古い名前。src/words.js と同じ) */
const SLOT_FIELDS: Record<
  string,
  { word: string[]; kana: string[]; img: string[] }
> = {
  wh1: { word: ['wh1', 'w1'], kana: ['wh1k', 'w1k'], img: ['wh1Img', 'w1Img'] },
  wh2: { word: ['wh2', 'w1_2'], kana: ['wh2k'], img: ['wh2Img', 'w1_2Img'] },
  wh3: { word: ['wh3'], kana: ['wh3k'], img: ['wh3Img'] },
  wm1: { word: ['wm1', 'w2'], kana: ['wm1k', 'w2k'], img: ['wm1Img', 'w2Img'] },
  wm2: { word: ['wm2', 'w2_2'], kana: ['wm2k'], img: ['wm2Img', 'w2_2Img'] },
  wm3: { word: ['wm3'], kana: ['wm3k'], img: ['wm3Img'] },
}

/**
 * 保存待ちの編集を重ねた番号文書 (保存キューの view) を、辞書データの 1 件に映す。
 * サーバへ送り終わって読み直すまで待たずに、一覧・詳細・ブックマーク・スライドへ出すため。
 * 映すのは語・かな・画像・代表だけ。スコアと人・物の一覧は、送り終わった後の読み直しで揃う
 */
export function withDocView(entry: NumberEntry, doc: NumberDoc): NumberEntry {
  const next: Record<string, unknown> = { ...entry }
  if (doc.slots) {
    for (const [slot, f] of Object.entries(SLOT_FIELDS)) {
      const s = doc.slots[slot]
      for (const key of f.word) next[key] = s?.word ?? ''
      for (const key of f.kana) next[key] = s?.kana ?? ''
      // 文書に画像が無い枠は辞書データの画像のまま (画像の正本は imageSlots)
      if (s?.imageUrl) for (const key of f.img) next[key] = s.imageUrl
    }
  }
  if (doc.rep)
    next.rep = {
      picks: doc.rep.picks.map(({ k, w }) => ({ k, w })),
      confirmed: doc.rep.confirmed,
    }
  return next as NumberEntry
}

/** 保存待ちの番号 (num → view) をまとめて辞書データに映す */
export function withDocViews(data: AppData, views: NumberDoc[]): AppData {
  return views.reduce((acc, doc) => {
    const entry = acc.numbers.find((item) => item.num === doc.num)
    return entry ? withNumberEntry(acc, withDocView(entry, doc)) : acc
  }, data)
}
