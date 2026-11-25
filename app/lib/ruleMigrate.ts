// 規則表 (かな → 数字) を変えたときに、登録済みの語を新しい規則で読める番号へ移す計画。
// 読み書きは scripts/rule-migrate.ts。
//
// 例: 28=ちゃ / 58=ふぁ を 28=ふぁ / 58=ちゃ に入れ替えると、ちゃぶ台 (283) は新しい規則では 583 と読む。
// 旧規則で番号どおりに読めていて、新規則では読めなくなった語だけを対象にし、新規則で読める番号へ移す。
//
// - 移し方はアプリの «別の番号へ移す» (numberDetail.ts#planMove) と同じ。
//   評価と画像は語に付いて回り、代表は番号ごとの判断なので運ばない (移動元の代表から外す)
// - 移すのは «旧規則で頭から読んで合っていた» 語だけ。中間省略 (1 字飛ばし) で合っていた語・
//   新規則で 3 桁の番号にならない語・移動先に同じ語がある / 枠が埋まっている語は移さず、手で直す一覧に出す
// - 1 つの番号から複数の語が抜けたり、移動先に続けて足したりするので、計画は前の移動を反映した文書の上で順に立てる

import type { NumberDoc, Rating } from './numberApi'
import { planMove, sameValue, slotRows } from './numberDetail'
import { checkReading, readingOf, type ReadingTables } from './reading'

export type RuleMove = {
  from: string
  /** 移動元で入っていた枠 (計画した時点。前の移動で詰め直した後の枠) */
  slot: string
  word: string
  kana: string
  to: string
  /** 移動先で入る枠 */
  targetSlot: string
}

export type RuleManual = {
  num: string
  slot: string
  word: string
  kana: string
  reason: string
}

export type RuleMigrationPlan = {
  moves: RuleMove[]
  manual: RuleManual[]
  /** 全部の移動を反映した後の文書 (書き込みのたびに計画し直す CLI の突き合わせ用) */
  docs: Record<string, NumberDoc>
}

const NUM = /^\d{3}$/

/** 旧規則では番号どおりに読めて、新規則では読めない語か */
function brokenBy(
  oldTables: ReadingTables,
  newTables: ReadingTables,
  kana: string,
  num: string
) {
  const before = checkReading(oldTables, kana, num)
  if (before.status !== 'ok') return null
  const after = checkReading(newTables, kana, num)
  if (after.status === 'ok') return null
  return { viaOmission: before.viaOmission }
}

function upsertRating(list: Rating[] | undefined, rating: Rating): Rating[] {
  return [...(list ?? []).filter((r) => !sameValue(r, rating)), rating]
}

/**
 * 1 語を移した後の 2 文書。planMove が組んだ slots / 評価 / 代表をそのまま当てる
 * (アプリの保存キューが送る操作と同じ中身)
 */
export function applyMovePlan(
  source: NumberDoc,
  target: NumberDoc,
  plan: Extract<ReturnType<typeof planMove>, { ok: true }>
): { source: NumberDoc; target: NumberDoc } {
  return {
    source: {
      ...source,
      slots: plan.sourceSlots,
      ...(plan.sourceRep ? { rep: plan.sourceRep } : {}),
    },
    target: {
      ...target,
      slots: plan.targetSlots,
      ...(plan.rating
        ? { ratings: upsertRating(target.ratings, plan.rating) }
        : {}),
    },
  }
}

/** 移さずに残す語 (番号 + 語)。枠が足りないとき、どれを入れるかを人が選ぶのに使う */
export type RuleKeep = { num: string; word: string }

/**
 * @param docs      numbers/* の全文書 (番号 → 文書)
 * @param oldTables 変える前の規則表
 * @param newTables 変えた後の規則表
 * @param keep      移さずに残す語。手で直す一覧に «残すと指定» として出す
 *
 * 番号順に 1 周してもまだ移せる語があれば (後の番号から語が抜けて枠が空いた等)、移せる語が無くなるまで回し直す
 */
export function planRuleMigration(
  docs: Record<string, NumberDoc>,
  oldTables: ReadingTables,
  newTables: ReadingTables,
  keep: RuleKeep[] = []
): RuleMigrationPlan {
  const state: Record<string, NumberDoc> = { ...docs }
  const moves: RuleMove[] = []
  let manual: RuleManual[] = []

  for (let progressed = true; progressed; ) {
    progressed = false
    manual = []
    for (const num of Object.keys(state).sort()) {
      // 手で直す語は同じ番号に残るので、2 度目は飛ばす ({k, w} で覚える)
      const skipped: { k: string; w: string }[] = []
      for (;;) {
        const source = state[num]
        const row = slotRows(source).find((r) => {
          if (!r.kana.trim()) return false
          if (skipped.some((s) => sameValue(s, { k: r.kana, w: r.word })))
            return false
          return brokenBy(oldTables, newTables, r.kana, num) !== null
        })
        if (!row) break

        const leave = (reason: string) => {
          skipped.push({ k: row.kana, w: row.word })
          manual.push({
            num,
            slot: row.slot,
            word: row.word,
            kana: row.kana,
            reason,
          })
        }

        if (keep.some((k) => k.num === num && k.word === row.word)) {
          leave('残すと指定した')
          continue
        }
        if (brokenBy(oldTables, newTables, row.kana, num)?.viaOmission) {
          leave('旧規則では中間省略 (1 字飛ばし) で合っていた')
          continue
        }
        const to = readingOf(newTables, row.kana).num
        if (!to || !NUM.test(to)) {
          leave('新規則で 3 桁の番号に読めない')
          continue
        }
        const target = state[to] ?? { num: to, slots: {} }
        const plan = planMove(source, row, target)
        if (!plan.ok) {
          leave(`${to} へ移せない: ${plan.error}`)
          continue
        }

        const next = applyMovePlan(source, target, plan)
        state[num] = next.source
        state[to] = next.target
        progressed = true
        moves.push({
          from: num,
          slot: row.slot,
          word: row.word,
          kana: row.kana,
          to,
          targetSlot: plan.targetSlot,
        })
      }
    }
  }

  return { moves, manual, docs: state }
}
