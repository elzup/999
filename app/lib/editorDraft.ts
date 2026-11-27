// 編集画面を離れるときの自動保存 (QA: 保存せずに閉じる事故)。
// 語とよみが揃った枠は保存し、揃っていない枠 (足しただけ・よみが空) は送らずに端末へ残して、
// 次にその番号を開いたときに戻す。サーバに送ると枠ごと弾かれ、他の枠の保存まで止まるため
import type { SlotRow } from './numberDetail'

const KEY_PREFIX = 'editorDraft.'

export const isCompleteRow = (row: Pick<SlotRow, 'word' | 'kana'>) =>
  Boolean(row.word.trim() && row.kana.trim())

/** 変わった枠の下書きを «送る» と «残す» に分ける */
export function splitDrafts(
  drafts: Record<string, SlotRow>,
  changed: readonly string[]
): { send: Record<string, SlotRow>; keep: Record<string, SlotRow> } {
  const pick = (isSend: boolean) =>
    Object.fromEntries(
      changed
        .filter((slot) => drafts[slot])
        .filter((slot) => isCompleteRow(drafts[slot]) === isSend)
        .map((slot) => [slot, drafts[slot]])
    )
  return { send: pick(true), keep: pick(false) }
}

export function loadKeptDrafts(num: string): Record<string, SlotRow> {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY_PREFIX + num) ?? 'null')
    return raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}
  } catch {
    // 読めない (プライベートモード・壊れた値) なら戻す下書きが無いだけ
    return {}
  }
}

export function saveKeptDrafts(num: string, drafts: Record<string, SlotRow>) {
  try {
    if (Object.keys(drafts).length) {
      localStorage.setItem(KEY_PREFIX + num, JSON.stringify(drafts))
    } else {
      localStorage.removeItem(KEY_PREFIX + num)
    }
  } catch {
    // 書けない環境では残せないだけ (送れる枠の保存は別に済んでいる)
  }
}
