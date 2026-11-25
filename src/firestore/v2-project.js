// 旧 numbers 文書 1 件から、v2_ の文書 (語 1 つずつ・番号の頭・評価) を作る。v2-assemble.js の逆。
// 移行 (.metarc/migrate-v2.ts) と、writeNumber の同じトランザクションでの書き込み (dual write) が
// 同じ規則を使うためにここに置く。片方だけ規則が変わると、移行直後と保存後で v2_ の形がずれる。

export const V2_PREFIX = 'v2_'
export const V2_WORDS = `${V2_PREFIX}words`
export const V2_NUMBERS = `${V2_PREFIX}numbers`
export const V2_RATINGS = `${V2_PREFIX}ratings`

const TAG_RE = /#([^\s#,]+)/g
const LABEL_RE = /(^|\s)-([a-z])(?=\s|$)/g
const ATTRIBUTE_TAGS = new Set(['g', 'i'])
const SIDES = ['hito', 'mono', 'gainen']
// 枠は «その side の一覧の n 番目» (sheet-layout.js の SLOT_ORDER: wh1 = 人の 1 番目)
const SIDE_SLOTS = { hito: ['wh1', 'wh2', 'wh3'], mono: ['wm1', 'wm2', 'wm3'] }

/** 語の文字列を、出典タグ 1 つずつに分ける (app/lib/tagVariants.ts と同じ規則) */
export function splitVariants(raw) {
  const tags = [...new Set([...raw.matchAll(TAG_RE)].map((m) => m[1]))]
  const source = tags.filter((t) => !ATTRIBUTE_TAGS.has(t))
  if (source.length < 2) return [raw]
  return source.map((keep) =>
    source
      .filter((t) => t !== keep)
      .reduce(
        (acc, t) => acc.replace(new RegExp(`#${t}(?=\\s|#|,|$)`, 'g'), ''),
        raw
      )
      .replace(/\s+/g, ' ')
      .trim()
  )
}

function parseWord(raw) {
  const tags = [...new Set([...raw.matchAll(TAG_RE)].map((m) => m[1]))]
  const labels = [...new Set([...raw.matchAll(LABEL_RE)].map((m) => m[2]))]
  const base = raw
    .replace(TAG_RE, '')
    .replace(LABEL_RE, '$1')
    .replace(/\s+/g, ' ')
    .trim()
  return { base, tags, labels }
}

/** その side の何番目かで枠を引く。位置で合わなければ同じ side の同じ語の枠 */
function slotFor(slots, side, itemIndex, raw) {
  const sideSlots = SIDE_SLOTS[side] ?? []
  const positional = sideSlots[itemIndex]
  if (positional && slots?.[positional]?.word === raw) return positional
  return sideSlots.find((key) => slots?.[key]?.word === raw) ?? ''
}

/**
 * 番号文書 1 件 → v2_ の文書の配列 [{ collection, id, data }]。
 * 語の id は 番号-連番 (同じ入力なら同じ id)。空の項目は位置として数えるが語にはしない
 */
export function projectNumberDoc(num, doc) {
  const slots = doc?.slots ?? {}
  const ratings = doc?.ratings ?? []
  const words = SIDES.flatMap((side) =>
    String(doc?.[side] ?? '')
      .split(',')
      .map((s) => s.trim())
      .flatMap((raw, item) => (raw ? [{ side, item, raw }] : []))
  ).flatMap(({ side, item, raw }) => {
    const slot = slotFor(slots, side, item, raw)
    return splitVariants(raw).map((text) => ({ side, item, text, slot }))
  })

  const wordDocs = words.map((w, i) => {
    const seq = i + 1
    const parsed = parseWord(w.text)
    return {
      collection: V2_WORDS,
      id: `${num}-${seq}`,
      data: {
        num,
        side: w.side,
        seq,
        item: w.item,
        base: parsed.base,
        text: w.text,
        kana: w.slot ? String(slots[w.slot]?.kana ?? '') : '',
        slot: w.slot,
        tags: parsed.tags,
        // n は評価 -1 へ移すので外す。s は廃止 (D-0143)
        labels: parsed.labels.filter((l) => l !== 'n' && l !== 's'),
        hasN: parsed.labels.includes('n'),
      },
    }
  })

  // ラベル n の語は評価 -1 として足す (かながあり、同じ (かな, 語) の評価が無いときだけ)
  const nRatings = wordDocs
    .filter((w) => w.data.hasN && w.data.kana)
    .filter(
      (w) => !ratings.some((r) => r.k === w.data.kana && r.w === w.data.text)
    )
    .map((w) => ({
      collection: V2_RATINGS,
      id: `${num}_n${w.data.seq}`,
      data: { num, k: w.data.kana, w: w.data.text, v: -1 },
    }))

  const ratingDocs = ratings.map((r, i) => ({
    collection: V2_RATINGS,
    id: `${num}_${i + 1}`,
    data: {
      num,
      k: String(r.k ?? ''),
      w: String(r.w ?? ''),
      v: Number(r.v),
    },
  }))

  const head = {
    collection: V2_NUMBERS,
    id: num,
    data: {
      source: doc?.source ?? '',
      updatedAt: doc?.updatedAt ?? null,
      confirmed: Boolean(doc?.rep?.confirmed),
      repPicks: (doc?.rep?.picks ?? []).map((p, i) => ({
        seq: i + 1,
        text: String(p.w),
        k: String(p.k),
      })),
    },
  }

  const stripHasN = ({ data: { hasN: _hasN, ...data }, ...rest }) => ({
    ...rest,
    data,
  })
  return [...wordDocs.map(stripHasN), head, ...nRatings, ...ratingDocs]
}

/**
 * 保存 1 回ぶんの v2_ の書き込み。前の文書にあって次に無い id は消す
 * (語が減ると 番号-連番 の後ろが余るので、残すと組み立てで消えたはずの語が出る)
 */
export function v2WritesFor(num, prev, next) {
  const sets = projectNumberDoc(num, next)
  const keep = new Set(sets.map((d) => `${d.collection}/${d.id}`))
  const deletes = (prev ? projectNumberDoc(num, prev) : [])
    .filter((d) => !keep.has(`${d.collection}/${d.id}`))
    .map(({ collection, id }) => ({ collection, id }))
  return { sets, deletes }
}

/** 環境変数で dual write を有効にする。既定は無効 (切り替えの段取りは .metarc/db-redesign-v3.md) */
export const isV2DualWrite = () => process.env.V2_DUAL_WRITE === '1'
