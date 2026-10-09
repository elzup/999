import { describe, expect, it } from 'vitest'
import type { NumberDoc } from '../lib/numberApi'
import {
  applyDraftEdit,
  applyFailure,
  applySaved,
  nextFreeSlot,
  mergeDraftRows,
  moveItem,
  nextRatingValue,
  ratedCount,
  ratingOf,
  repRankOf,
  slotRows,
  slotsFromRows,
  swapRepPicks,
  setRepPick,
} from '../lib/numberDetail'

const doc: NumberDoc = {
  num: '051',
  slots: {
    wh1: { word: '鯉', kana: 'こい', imageUrl: 'a.jpg', confirmedFor: '鯉' },
    wh2: { word: '恋', kana: 'こい' },
    wm1: {
      word: 'コイン',
      kana: 'こいん',
      imageUrl: 'b.jpg',
      confirmedFor: '故意',
    },
  },
  rep: { picks: [{ k: 'こい', w: '鯉' }], confirmed: false },
  ratings: [
    { k: 'こい', w: '鯉', v: 2 },
    { k: 'こい', w: '恋', v: 0 },
  ],
  derived: {
    ptBySlot: { wh1: 8.2, wh2: 7.0 },
    rankeyBySlot: { wh1: 'AB', wh2: 'Aw' },
  },
  updatedAt: '2026-08-29T00:00:00.000Z',
}

describe('slotRows', () => {
  it('語のあるスロットだけを SLOT_ORDER 順に出す (REQ-NDV-001)', () => {
    expect(slotRows(doc).map((row) => row.slot)).toEqual(['wh1', 'wh2', 'wm1'])
  })

  it('rankey と pt を候補ごとに載せる (REQ-NDV-001)', () => {
    const [first] = slotRows(doc)
    expect(first.rankey).toBe('AB')
    expect(first.pt).toBe(8.2)
  })

  it('確定時点の語とずれた画像だけ stale にする (REQ-CON-005)', () => {
    const rows = slotRows(doc)
    expect(rows.find((row) => row.slot === 'wh1')?.imageStale).toBe(false)
    expect(rows.find((row) => row.slot === 'wm1')?.imageStale).toBe(true)
  })

  it('タグが付いただけの語は stale にしない', () => {
    const tagged: NumberDoc = {
      ...doc,
      slots: {
        wh1: {
          word: '鯉#g',
          kana: 'こい',
          imageUrl: 'a.jpg',
          confirmedFor: '鯉',
        },
      },
    }
    expect(slotRows(tagged)[0].imageStale).toBe(false)
  })
})

describe('ratings', () => {
  it('評価は値 (読み+語) で引く。スロット位置では引かない', () => {
    expect(ratingOf(doc, 'wh1')).toBe(2)
    expect(ratingOf(doc, 'wh2')).toBe(0)
  })

  it('未評価は null。0 (普通) と別状態', () => {
    expect(ratingOf(doc, 'wm1')).toBeNull()
    expect(ratedCount(doc)).toBe(2)
  })

  it('同じ値をもう一度押すと未評価に戻す (0 にはしない)', () => {
    expect(nextRatingValue(2, 2)).toBeNull()
    expect(nextRatingValue(0, 0)).toBeNull()
    expect(nextRatingValue(null, 0)).toBe(0)
    expect(nextRatingValue(2, -1)).toBe(-1)
  })
})

describe('rep picks', () => {
  it('代表は値で解決する。順位は 1 始まり', () => {
    expect(repRankOf(doc, 'wh1')).toBe(1)
    expect(repRankOf(doc, 'wh2')).toBe(0)
  })

  it('② を押すとその語が ② になる', () => {
    expect(setRepPick(doc, 'wh2', 2)).toEqual([
      { k: 'こい', w: '鯉' },
      { k: 'こい', w: '恋' },
    ])
  })

  it('① にいる語の ① を押すと外す', () => {
    expect(setRepPick(doc, 'wh1', 1)).toEqual([])
  })

  it('① が空のまま ② を押すと ① に詰まる', () => {
    const empty: NumberDoc = { ...doc, rep: { picks: [], confirmed: false } }
    expect(setRepPick(empty, 'wh2', 2)).toEqual([{ k: 'こい', w: '恋' }])
  })

  it('ラジオ: 別の語の ① を押すと入れ替わり、同じ語は ①② を兼ねない', () => {
    const two: NumberDoc = {
      ...doc,
      rep: {
        picks: [
          { k: 'こい', w: '鯉' },
          { k: 'こい', w: '恋' },
        ],
        confirmed: false,
      },
    }
    // ① を別の語へ: ② はそのまま
    expect(setRepPick(two, 'wm1', 1)).toEqual([
      { k: 'こいん', w: 'コイン' },
      { k: 'こい', w: '恋' },
    ])
    // ② の語を ① へ: ② から抜けて ① に上がる
    expect(setRepPick(two, 'wh2', 1)).toEqual([{ k: 'こい', w: '恋' }])
    // ① を外すと ② が繰り上がる
    expect(setRepPick(two, 'wh1', 1)).toEqual([{ k: 'こい', w: '恋' }])
  })

  it('入替は 2 件揃っているときだけ効く', () => {
    const picks = [
      { k: 'こい', w: '鯉' },
      { k: 'こい', w: '恋' },
    ]
    expect(swapRepPicks(picks)).toEqual([picks[1], picks[0]])
    expect(swapRepPicks([picks[0]])).toEqual([picks[0]])
  })
})

describe('並べ替え・追加・削除 (REQ-NDV-002 / 010 / 011)', () => {
  it('ドラッグの結果は配列の移動そのもの', () => {
    expect(moveItem(['a', 'b', 'c'], 2, 0)).toEqual(['c', 'a', 'b'])
    expect(moveItem(['a', 'b', 'c'], 0, 2)).toEqual(['b', 'c', 'a'])
    expect(moveItem(['a', 'b', 'c'], 1, 1)).toEqual(['a', 'b', 'c'])
  })

  it('並べ替えると wh 系・wm 系それぞれ先頭から詰め直される', () => {
    const rows = slotRows(doc)
    const moved = moveItem(rows, 1, 0) // wh2(恋) を先頭へ
    const slots = slotsFromRows(moved, doc)

    expect(slots.wh1.word).toBe('恋')
    expect(slots.wh2.word).toBe('鯉')
    expect(slots.wm1.word).toBe('コイン')
  })

  it('画像と確定時点の語は語に付いて回る', () => {
    const rows = slotRows(doc)
    const slots = slotsFromRows(moveItem(rows, 1, 0), doc)

    // 鯉 は wh1 → wh2 へ移ったが、鯉の画像がそのまま付いている
    expect(slots.wh2.imageUrl).toBe('a.jpg')
    expect(slots.wh2.confirmedFor).toBe('鯉')
    expect(slots.wh1.imageUrl).toBe('')
  })

  it('行を除くと保存対象から消える (削除)', () => {
    const rows = slotRows(doc).filter((row) => row.slot !== 'wh2')
    const slots = slotsFromRows(rows, doc)

    expect(Object.keys(slots)).toEqual(['wh1', 'wm1'])
  })

  it('語もかなも空の行は保存しない', () => {
    const rows = [
      ...slotRows(doc),
      { slot: 'wh3', word: '  ', kana: '', imageUrl: '' },
    ]
    expect(Object.keys(slotsFromRows(rows as never, doc))).toEqual([
      'wh1',
      'wh2',
      'wm1',
    ])
  })

  it('追加した空スロットの draft も表示行に出る (候補を追加が効かない原因)', () => {
    const saved = slotRows(doc)
    const draft = {
      wh3: {
        slot: 'wh3',
        word: '',
        kana: '',
        imageStale: false,
        rating: null,
        repRank: 0,
      },
    }

    const merged = mergeDraftRows(saved, draft)

    // 保存済みスロットだけを走査すると wh3 が落ちる
    expect(merged.map((row) => row.slot)).toEqual(['wh1', 'wh2', 'wh3', 'wm1'])
  })

  it('下書きの無い保存済みの行を編集しても slot・kana が残る (語が入力できない原因)', () => {
    const saved = slotRows(doc)
    const first = applyDraftEdit({}, saved[0], { word: 'あ' })
    const second = applyDraftEdit(first, mergeDraftRows(saved, first)[0], {
      word: 'あい',
    })

    expect(second[saved[0].slot]).toEqual({ ...saved[0], word: 'あい' })
    expect(Object.keys(second)).toEqual([saved[0].slot])
  })

  it('既存スロットの draft は保存済みの行を置き換える', () => {
    const saved = slotRows(doc)
    const draft = { wh1: { ...saved[0], word: '鯉のぼり' } }

    const merged = mergeDraftRows(saved, draft)

    expect(merged).toHaveLength(saved.length)
    expect(merged[0].word).toBe('鯉のぼり')
  })

  it('人 / 物 それぞれ空いている番号を返す。埋まったら null', () => {
    expect(nextFreeSlot(slotRows(doc), 'wm')).not.toBeNull()

    const full = {
      ...doc,
      slots: Object.fromEntries(
        ['wh1', 'wh2', 'wh3', 'wm1', 'wm2'].map((slot) => [
          slot,
          { word: 'x', kana: 'えっくす' },
        ])
      ),
    }
    expect(nextFreeSlot(slotRows(full), 'wh')).toBeNull()
    expect(nextFreeSlot(slotRows(full), 'wm')).toBe('wm3')

    const packed = {
      ...doc,
      slots: Object.fromEntries(
        ['wh1', 'wh2', 'wh3', 'wm1', 'wm2', 'wm3'].map((slot) => [
          slot,
          { word: 'x', kana: 'えっくす' },
        ])
      ),
    }
    expect(nextFreeSlot(slotRows(packed), 'wm')).toBeNull()
  })

  it('歯抜けの番号を埋める (件数 + 1 だと既存と衝突する)', () => {
    const gap = {
      ...doc,
      slots: {
        wh1: { word: 'x', kana: 'えっくす' },
        wh3: { word: 'y', kana: 'わい' },
      },
    }
    expect(nextFreeSlot(slotRows(gap), 'wh')).toBe('wh2')
  })
})

describe('保存の反映 (REQ-NDV-007)', () => {
  const state = { doc, status: '', saving: true }

  it('成功したときだけ文書を差し替える', () => {
    const saved = { ...doc, updatedAt: '2026-08-29T01:00:00.000Z' }
    const next = applySaved(state, saved)

    expect(next.doc?.updatedAt).toBe('2026-08-29T01:00:00.000Z')
    expect(next.saving).toBe(false)
  })

  it('保存結果が無ければ state を変えない', () => {
    expect(applySaved(state, null)).toBe(state)
  })

  it('失敗しても文書は元のまま、理由だけ出す', () => {
    const next = applyFailure(state, new Error('他の画面が先に保存しました'))

    expect(next.doc).toBe(doc)
    expect(next.status).toBe('他の画面が先に保存しました')
    expect(next.saving).toBe(false)
  })
})
