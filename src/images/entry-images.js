// 画像の枠 (imageSlots の w1 / w1_2#res / P など) を、配信データの 1 件 (番号・日付・カード) の
// 画像のフィールドに書く規則。サーバ (/api/app/data が正本の画像を重ねる) とアプリ (ピッカーで
// 選んだ画像をその場で全画面に反映する) で同じ規則を使うため、依存の無いここに置く。
//
// 番号・日付は新しい名前 (wh1Img) と古い名前 (w1Img) の両方を書く。配信データは両方を持っていて、
// 読む側 (src/words.js・app/data/parse.ts) は新しい名前を先に見るので、片方だけだと古い画像が勝つ。
// このモジュールは Function からも読み込む (scripts/sync-functions-lib.sh)。

/** 画像の枠 → 番号・日付のフィールド */
export const WORD_IMAGE_FIELDS = {
  w1: ['wh1Img', 'w1Img'],
  w1_2: ['wh2Img', 'w1_2Img'],
  wh3: ['wh3Img'],
  w2: ['wm1Img', 'w2Img'],
  w2_2: ['wm2Img', 'w2_2Img'],
  wm3: ['wm3Img'],
}

/** 画像の枠 → タグ違いの画像のフィールド (w1_2#res → wh2TagImg.res。D-0039) */
const TAG_IMAGE_FIELD = {
  w1: 'wh1TagImg',
  w1_2: 'wh2TagImg',
  wh3: 'wh3TagImg',
  w2: 'wm1TagImg',
  w2_2: 'wm2TagImg',
  wm3: 'wm3TagImg',
}

/** カードの枠 → フィールド */
export const CARD_IMAGE_FIELDS = {
  P: ['personImg'],
  A: ['actionImg'],
  O: ['objectImg'],
}

/**
 * 1 件に 1 枠の画像を書いた新しい 1 件を返す。知らない枠ならそのまま返す
 * @param {object} entry 配信データの 1 件
 * @param {string} slot 画像の枠 (w1 / w1_2#res / P ...)
 * @param {string} url
 */
export function withEntryImage(entry, slot, url) {
  if (!entry || !url) return entry
  const at = slot.indexOf('#')
  if (at >= 0) {
    const field = TAG_IMAGE_FIELD[slot.slice(0, at)]
    const tag = slot.slice(at + 1)
    if (!field || !tag) return entry
    if (entry[field]?.[tag] === url) return entry
    return { ...entry, [field]: { ...entry[field], [tag]: url } }
  }
  const fields = WORD_IMAGE_FIELDS[slot] ?? CARD_IMAGE_FIELDS[slot]
  if (!fields || fields.every((f) => entry[f] === url)) return entry
  return { ...entry, ...Object.fromEntries(fields.map((f) => [f, url])) }
}

/**
 * imageSlots の文書 ({ "id:slot": { image } }) → id ごとの { slot: url }
 * @param {Record<string, {image?: {url?: string}}>} docs
 */
export function slotUrlsById(docs) {
  const out = {}
  for (const [key, doc] of Object.entries(docs ?? {})) {
    const url = doc?.image?.url
    const at = key.indexOf(':')
    if (!url || at < 0) continue
    const id = key.slice(0, at)
    out[id] = { ...out[id], [key.slice(at + 1)]: url }
  }
  return out
}

const applyAll = (entry, urls) =>
  Object.entries(urls ?? {}).reduce(
    (acc, [slot, url]) => withEntryImage(acc, slot, url),
    entry
  )

/** カードの画像の id (src/images/targets.js の cardId と同じ: 数字 + 柄) */
export const cardImageId = (card) => `${card.rank}${card.suit}`

/**
 * 配信データ (numbers / dates / cards) に、正本 (imageSlots) の画像を重ねる。
 * 配信データの画像は deploy のときの写しなので、アプリ・console で選び直した画像を次の deploy まで
 * 出せなかった
 */
export function withSlotImages(data, docs) {
  const byId = slotUrlsById(docs)
  if (!Object.keys(byId).length) return data
  const overlay = (list, idOf) =>
    Array.isArray(list)
      ? list.map((entry) => applyAll(entry, byId[idOf(entry)]))
      : list
  return {
    ...data,
    numbers: overlay(data.numbers, (n) => n.num),
    dates: overlay(data.dates, (d) => d.num),
    cards: overlay(data.cards, cardImageId),
  }
}

/** 画像の枠 → 番号文書の枠 (src/images/targets.js の CANONICAL_SLOT と同じ) */
const NUMBER_SLOT_OF = {
  w1: 'wh1',
  w1_2: 'wh2',
  wh3: 'wh3',
  w2: 'wm1',
  w2_2: 'wm2',
  wm3: 'wm3',
}

/**
 * console の state (deploy のときに焼いた対象と語) の番号の語を、番号文書の最新の語にする。
 * 焼いた語のままだと、アプリで語を直しても画像の検索・語変更の判定が古い語で動いた。
 * タグ違いで分けた枠 (w1_2#res) は焼いたときの分け方のまま (語を直したら deploy で作り直す)
 * @param {{targets: object[]}} state
 * @param {Record<string, {slots?: Record<string, {word?: string}>}>} numberDocs num → 番号文書
 */
export function withLiveTargetWords(state, numberDocs) {
  if (!numberDocs || !Array.isArray(state?.targets)) return state
  const targets = state.targets.map((target) => {
    const doc = target.kind === 'num' ? numberDocs[target.id] : null
    if (!doc?.slots) return target
    const words = Object.fromEntries(
      Object.entries(NUMBER_SLOT_OF).map(([slot, canon]) => [
        slot,
        String(doc.slots[canon]?.word ?? '').trim(),
      ])
    )
    return Object.entries(words).every(
      ([slot, w]) => (target[slot] ?? '') === w
    )
      ? target
      : { ...target, ...words }
  })
  return { ...state, targets }
}
