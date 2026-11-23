// 画像の対象 (console の state.targets) の番号の分に、DB の最新の語を重ねる。
//
// state は nr deploy のときに手元の words.tsv から焼いた写しなので、アプリで足した・直した語は
// «DB → シート → nr sync → nr deploy» を全部通るまで画像の候補タブに出てこなかった。
// /app/data が DB の語を重ねているのと同じく、/console/state でも DB を正本にする。
// 日付・カードは DB に無いので焼いた写しのまま使う。
//
// Function からも読む (functions/lib/images に写す)。fs に頼らないこと。

import { IMAGE_KINDS, buildTargets } from './targets.js'

const WORD_KEYS = ['wh1', 'wh2', 'wh3', 'wm1', 'wm2', 'wm3']

/** 番号文書 (numbers/{num}) を words.tsv の 1 行と同じ形 ({num, wh1, wh1k, …}) にする */
export function wordRowOf(num, doc) {
  const slots = doc?.slots ?? {}
  return Object.fromEntries([
    ['num', num],
    ...WORD_KEYS.flatMap((key) => [
      [key, slots[key]?.word ?? ''],
      [`${key}k`, slots[key]?.kana ?? ''],
    ]),
  ])
}

/**
 * 焼いた state の番号の対象を、DB の文書から作り直した対象に置き換える。
 * DB に無い番号 (読めなかった等) は焼いた対象を残す。並びは番号 → 日付 → カードのまま
 * @param {{ targets: Array<{ id: string, kind: string }> }} state
 * @param {Record<string, { slots?: Record<string, { word?: string, kana?: string }> }>} docs
 */
export function withLiveNumberTargets(state, docs) {
  const live = new Map(
    buildTargets({
      words: Object.entries(docs).map(([num, doc]) => wordRowOf(num, doc)),
    }).map((target) => [target.id, target])
  )
  const baked = state.targets ?? []
  const bakedNums = baked.filter((t) => t.kind === 'num')
  const ids = [
    ...new Set([...bakedNums.map((t) => t.id), ...live.keys()]),
  ].sort()
  const numTargets = ids.flatMap((id) => {
    if (live.has(id)) return [live.get(id)]
    // DB に文書はあるが語が 1 つも無い番号は対象から外す (語を全部消した)
    if (id in docs) return []
    return bakedNums.filter((t) => t.id === id)
  })
  const others = baked.filter((t) => t.kind !== 'num')
  return {
    ...state,
    kinds: state.kinds ?? IMAGE_KINDS,
    targets: [...numTargets, ...others],
  }
}
