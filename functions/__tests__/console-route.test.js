import { describe, expect, it } from 'vitest'
import * as docs from '../../src/images/slot-docs.js'
import { createSlotStore } from '../../src/images/slot-store.js'
import { buildSearchWord } from '../../src/images/query.js'
import { handleConsoleRequest } from '../console-route.js'

const NOW = '2026-11-18T00:00:00.000Z'

const state = {
  kinds: { num: { slots: ['w1', 'w2'] } },
  targets: [
    { id: '001', kind: 'num', w2: 'マオ#コードギアス' },
    { id: '002', kind: 'num', slots: ['w1', 'w1#res'], w1: 'ミミ' },
    { id: '003', kind: 'num', w1: 'ミミ#pr -a' },
  ],
  // 略語タグ → 正式名 (Mac の tags.json を焼いたもの)
  tagNames: { pr: 'プリコネ' },
}

const img = (hash) => ({ url: `https://example.test/${hash}.webp`, hash })

/** imageSlots だけを持つ Firestore のモック。読んだ回数も数える */
function fakeFirestore(initial) {
  const docs = { ...initial }
  const reads = { full: 0, since: 0 }
  const snapOf = (id) => ({
    id,
    exists: docs[id] !== undefined,
    data: () => docs[id],
  })
  const all = () => Object.keys(docs).map(snapOf)
  const col = {
    doc: (id) => ({ id }),
    get: async () => {
      reads.full++
      return { docs: all() }
    },
    where: (field, _op, value) => ({
      get: async () => {
        reads.since++
        return { docs: all().filter((s) => (s.data()[field] ?? '') > value) }
      },
    }),
  }
  const runTransaction = (fn) =>
    fn({
      get: async (ref) => snapOf(ref.id),
      set: (ref, value) => {
        docs[ref.id] = value
      },
    })
  return { docs, reads, slots: createSlotStore({ col, runTransaction }) }
}

const initialDocs = () => ({
  '001:w1': {
    id: '001',
    slot: 'w1',
    image: img('a'),
    keep: true,
    redo: null,
    candidate: null,
    history: [],
  },
})

/** 検索・DL・GCS の代わり。呼ばれた引数を残し、決まった画像を返す */
function fakeFetcher() {
  const calls = []
  return {
    calls,
    queryOf: async (word) => `q:${word}`,
    bySearch: async (args) => {
      calls.push({ op: 'search', ...args })
      return args.query === 'q:none'
        ? null
        : { ...img('new'), sourceImageUrl: 'https://src.test/new.jpg' }
    },
    candidates: async (args) => {
      calls.push({ op: 'candidates', ...args })
      return args.query === 'q:none'
        ? []
        : ['c1', 'c2', 'c3'].map((h) => ({
            ...img(h),
            sourceImageUrl: `https://src.test/${h}.jpg`,
          }))
    },
    recrop: async ({ image, position }) => {
      calls.push({ op: 'recrop', image, position })
      return { ...image, ...img('top') }
    },
  }
}

function setup(initial = initialDocs()) {
  const fs = fakeFirestore(initial)
  const fetcher = fakeFetcher()
  const request = (method, path, body) =>
    handleConsoleRequest({
      method,
      path,
      body,
      state,
      slots: fs.slots,
      docs,
      fetcher,
      now: NOW,
    })
  return { ...fs, fetcher, request }
}

describe('handleConsoleRequest', () => {
  it('焼いた対象に、正本の画像と印を重ねて返す', async () => {
    const { request } = setup()
    const res = await request('GET', '/console/state', {})
    expect(res.status).toBe(200)
    expect(res.payload.targets).toBe(state.targets)
    expect(res.payload.images['001'].w1.hash).toBe('a')
    expect(res.payload.keep).toEqual({ '001:w1': true })
    // 取り直しを受けられる Function だと画面に知らせる
    expect(res.payload.canFetch).toBe(true)
  })

  it('ロックの印を正本に書き、keep の一覧を返す', async () => {
    const { request, docs } = setup()
    const res = await request('POST', '/console/keep', {
      id: '001',
      slot: 'w2',
      on: true,
    })
    expect(res.status).toBe(200)
    expect(res.payload.keep).toEqual({ '001:w1': true, '001:w2': true })
    expect(docs['001:w2']).toMatchObject({ keep: true, updatedAt: NOW })
  })

  it('タグ違いで分けた枠は targets の slots にあれば通す', async () => {
    const { request } = setup()
    const res = await request('POST', '/console/redo', {
      id: '002',
      slot: 'w1#res',
      on: true,
    })
    expect(res.status).toBe(200)
    expect(res.payload.redo['002:w1#res'].flaggedAt).toBe(NOW)
  })

  it('撮り直しの印を外すと redo の一覧から消える', async () => {
    const { request } = setup()
    const body = { id: '002', slot: 'w1', on: true }
    await request('POST', '/console/redo', body)
    const res = await request('POST', '/console/redo', { ...body, on: false })
    expect(res.payload.redo).toEqual({})
  })

  it('焼いた targets に無い枠は断る', async () => {
    const { request, docs } = setup()
    const res = await request('POST', '/console/keep', {
      id: '001',
      slot: 'w1#res',
      on: true,
    })
    expect(res.status).toBe(400)
    expect(docs['001:w1#res']).toBeUndefined()
  })

  it('ロック中の枠に撮り直しの印は付けない', async () => {
    const { request, docs } = setup()
    const res = await request('POST', '/console/redo', {
      id: '001',
      slot: 'w1',
      on: true,
    })
    expect(res.status).toBe(409)
    expect(docs['001:w1'].redo).toBeNull()
  })

  it('全件を読むのは最初の 1 回だけ。あとは更新分だけ読み足す', async () => {
    const { request, reads, docs } = setup()
    await request('GET', '/console/state', {})
    await request('POST', '/console/keep', { id: '001', slot: 'w2', on: true })
    // Mac の同期が別の枠を書いた
    docs['002:w1'] = {
      ...initialDocs()['001:w1'],
      id: '002',
      image: img('mac'),
      updatedAt: NOW,
    }
    const res = await request('GET', '/console/state', {})
    expect(reads.full).toBe(1)
    expect(res.payload.images['002'].w1.hash).toBe('mac')
  })

  it('書き込みは POST だけ', async () => {
    const { request } = setup()
    expect((await request('GET', '/console/keep', {})).status).toBe(405)
  })

  it('担当外の経路は null', async () => {
    const { request } = setup()
    expect(await request('GET', '/console/other', {})).toBeNull()
  })
})

describe('handleConsoleRequest: その場の取り直し', () => {
  // 001:w2 は画像があり、撮り直しの印と前の画像がある
  const withImage = () => ({
    ...initialDocs(),
    '001:w2': {
      id: '001',
      slot: 'w2',
      image: { ...img('cur'), sourceImageUrl: 'https://src.test/cur.jpg' },
      keep: false,
      redo: { flaggedAt: NOW, reason: '' },
      candidate: { word: 'マオ', query: 'マオ', rejectedUrls: ['https://x/r'] },
      history: [{ ...img('old'), sourceImageUrl: 'https://src.test/old.jpg' }],
    },
  })

  it('redo-now は語から検索し、今と前の画像を避けて取り直す', async () => {
    const { request, docs: stored, fetcher } = setup(withImage())
    const res = await request('POST', '/console/redo-now', {
      id: '001',
      slot: 'w2',
    })
    expect(res).toMatchObject({ status: 200, payload: { ok: true } })
    expect(res.payload.image.hash).toBe('new')
    expect(fetcher.calls[0]).toMatchObject({
      query: 'q:マオ#コードギアス',
      rejected: [
        'https://src.test/cur.jpg',
        'https://src.test/old.jpg',
        'https://x/r',
      ],
    })
    const doc = stored['001:w2']
    expect(doc.image.hash).toBe('new')
    expect(doc.history.map((h) => h.hash)).toEqual(['cur', 'old'])
    expect(doc.redo).toBeNull()
    expect(doc.updatedAt).toBe(NOW)
    // 弾いた URL は残し、語と検索ワードを記録する
    expect(doc.candidate).toMatchObject({
      word: 'マオ#コードギアス',
      query: 'q:マオ#コードギアス',
      status: 'ok',
      rejectedUrls: ['https://x/r'],
    })
  })

  it('redo-now は文書の無い枠 (未取得) にも画像を付ける', async () => {
    const { request, docs: stored } = setup()
    const res = await request('POST', '/console/redo-now', {
      id: '002',
      slot: 'w1',
    })
    expect(res.payload.ok).toBe(true)
    expect(stored['002:w1']).toMatchObject({
      id: '002',
      slot: 'w1',
      keep: false,
      history: [],
    })
  })

  it('ロック中の枠は取りにも行かない', async () => {
    const { request, fetcher, docs: stored } = setup()
    const res = await request('POST', '/console/redo-now', {
      id: '001',
      slot: 'w1',
    })
    expect(res.status).toBe(409)
    expect(fetcher.calls).toEqual([])
    expect(stored['001:w1'].image.hash).toBe('a')
  })

  it('取っている間にロックされたら書かない', async () => {
    const { request, fetcher, docs: stored } = setup(withImage())
    const search = fetcher.bySearch
    fetcher.bySearch = async (args) => {
      stored['001:w2'] = { ...stored['001:w2'], keep: true }
      return search(args)
    }
    const res = await request('POST', '/console/redo-now', {
      id: '001',
      slot: 'w2',
    })
    expect(res.status).toBe(409)
    expect(stored['001:w2'].image.hash).toBe('cur')
  })

  it('語の無い枠・見つからない・取得の失敗は ok: false で返す', async () => {
    const { request, fetcher } = setup()
    const noWord = await request('POST', '/console/redo-now', {
      id: '002',
      slot: 'w1#res',
    })
    expect(noWord.payload).toEqual({ ok: false, error: 'この枠に語が無い' })

    const none = await request('POST', '/console/search-custom', {
      id: '002',
      slot: 'w1',
      query: 'q:none',
    })
    expect(none.payload).toEqual({ ok: false, error: '見つからない' })

    fetcher.bySearch = async () => {
      throw new Error('候補の取得に全部失敗')
    }
    const broken = await request('POST', '/console/redo-now', {
      id: '002',
      slot: 'w1',
    })
    expect(broken.payload.ok).toBe(false)
    expect(broken.payload.error).toContain('全部失敗')
  })

  it('search-custom は渡したワードで探し、候補の記録は変えない', async () => {
    const { request, fetcher, docs: stored } = setup(withImage())
    const res = await request('POST', '/console/search-custom', {
      id: '001',
      slot: 'w2',
      query: '  ゼロ  ',
    })
    expect(res.payload.ok).toBe(true)
    expect(fetcher.calls[0].query).toBe('ゼロ')
    expect(stored['001:w2'].candidate.word).toBe('マオ')
  })

  it('search-custom はワードが空なら探さない', async () => {
    const { request, fetcher } = setup(withImage())
    const res = await request('POST', '/console/search-custom', {
      id: '001',
      slot: 'w2',
      query: ' ',
    })
    expect(res.payload).toEqual({ ok: false, error: '検索ワードが空' })
    expect(fetcher.calls).toEqual([])
  })

  it('recrop は寄せ方を渡せる (既定は上寄せ)。不正な寄せ方は断る', async () => {
    const { request, fetcher } = setup(withImage())
    await request('POST', '/console/recrop', { id: '001', slot: 'w2' })
    await request('POST', '/console/recrop', {
      id: '001',
      slot: 'w2',
      position: 'left',
    })
    expect(fetcher.calls.map((c) => c.position)).toEqual(['top', 'left'])
    const bad = await request('POST', '/console/recrop', {
      id: '001',
      slot: 'w2',
      position: 'middle',
    })
    expect(bad.status).toBe(400)
  })

  it('recrop は今の画像を切り抜き直す', async () => {
    const { request, fetcher, docs: stored } = setup(withImage())
    const res = await request('POST', '/console/recrop', {
      id: '001',
      slot: 'w2',
    })
    expect(res.payload.image.hash).toBe('top')
    expect(fetcher.calls[0].image.hash).toBe('cur')
    expect(stored['001:w2'].history[0].hash).toBe('cur')
  })

  it('set-image は 2 択の «今までの方» に戻せる', async () => {
    const { request, docs: stored } = setup(withImage())
    await request('POST', '/console/redo-now', { id: '001', slot: 'w2' })
    const res = await request('POST', '/console/set-image', {
      id: '001',
      slot: 'w2',
      image: { hash: 'cur' },
    })
    expect(res.payload.ok).toBe(true)
    // 画面から来た中身ではなく、文書に残っていた画像に戻す
    expect(stored['001:w2'].image).toEqual({
      ...img('cur'),
      sourceImageUrl: 'https://src.test/cur.jpg',
    })
    expect(stored['001:w2'].history.map((h) => h.hash)).toEqual([
      'new',
      'cur',
      'old',
    ])
  })

  it('set-image はこの枠に載ったことのない画像を断る', async () => {
    const { request, docs: stored } = setup(withImage())
    const res = await request('POST', '/console/set-image', {
      id: '001',
      slot: 'w2',
      image: { hash: 'evil', url: 'https://evil.test/x.webp' },
    })
    expect(res.status).toBe(400)
    expect(stored['001:w2'].image.hash).toBe('cur')
  })

  it('取り直しも焼いた targets に無い枠は断る', async () => {
    const { request, fetcher } = setup()
    const res = await request('POST', '/console/redo-now', {
      id: '999',
      slot: 'w1',
    })
    expect(res.status).toBe(400)
    expect(fetcher.calls).toEqual([])
  })

  describe('ピッカーの候補 (D-0088)', () => {
    it('candidates は語から検索して候補を返し、文書に残す (採用はしない)', async () => {
      const { request, docs: stored, fetcher } = setup(withImage())
      const res = await request('POST', '/console/candidates', {
        id: '001',
        slot: 'w2',
      })
      expect(res.payload).toMatchObject({
        ok: true,
        query: 'q:マオ#コードギアス',
      })
      expect(res.payload.current.hash).toBe('cur')
      expect(res.payload.candidates.map((c) => c.hash)).toEqual([
        'c1',
        'c2',
        'c3',
      ])
      expect(fetcher.calls[0].rejected).toContain('https://src.test/cur.jpg')
      expect(stored['001:w2'].image.hash).toBe('cur')
      expect(stored['001:w2'].choices.map((c) => c.hash)).toEqual([
        'c1',
        'c2',
        'c3',
      ])
    })

    it('検索ワードを渡せばそれで探す (D-2)', async () => {
      const { request, fetcher } = setup(withImage())
      await request('POST', '/console/candidates', {
        id: '001',
        slot: 'w2',
        query: ' 別の語 ',
      })
      expect(fetcher.calls[0].query).toBe('別の語')
    })

    it('見つからなければ ok: false で理由を返す', async () => {
      const { request } = setup(withImage())
      const res = await request('POST', '/console/candidates', {
        id: '001',
        slot: 'w2',
        query: 'q:none',
      })
      expect(res.payload.ok).toBe(false)
    })

    it('ロック中の枠は候補を取らない', async () => {
      const { request, fetcher } = setup()
      const res = await request('POST', '/console/candidates', {
        id: '001',
        slot: 'w1',
      })
      expect(res.status).toBe(409)
      expect(fetcher.calls).toEqual([])
    })

    it('reuse なら前に取った候補を検索せずに返す (今の画像は除く)', async () => {
      const { request, fetcher } = setup(withImage())
      await request('POST', '/console/candidates', { id: '001', slot: 'w2' })
      await request('POST', '/console/set-image', {
        id: '001',
        slot: 'w2',
        image: { hash: 'c2' },
      })
      const res = await request('POST', '/console/candidates', {
        id: '001',
        slot: 'w2',
        reuse: true,
      })
      expect(fetcher.calls).toHaveLength(1)
      expect(res.payload).toMatchObject({ ok: true, reused: true })
      expect(res.payload.candidates.map((c) => c.hash)).toEqual(['c1', 'c3'])
    })

    it('auto の検索ワードは画面の展開ではなく、ここで作り直したもので探す (reuse も効く)', async () => {
      const { request, fetcher } = setup(withImage())
      const res = await request('POST', '/console/candidates', {
        id: '001',
        slot: 'w2',
        query: '画面で作った語',
        auto: true,
      })
      expect(fetcher.calls[0].query).toBe('q:マオ#コードギアス')
      expect(res.payload.query).toBe('q:マオ#コードギアス')
      const again = await request('POST', '/console/candidates', {
        id: '001',
        slot: 'w2',
        query: '画面で作った語',
        auto: true,
        reuse: true,
      })
      expect(again.payload.reused).toBe(true)
      expect(fetcher.calls).toHaveLength(1)
    })

    it('reuse でも残った候補が無い・検索ワードを渡したときは検索する', async () => {
      const { request, fetcher } = setup(withImage())
      await request('POST', '/console/candidates', {
        id: '001',
        slot: 'w2',
        reuse: true,
      })
      await request('POST', '/console/candidates', {
        id: '001',
        slot: 'w2',
        reuse: true,
        query: 'ゼロ',
      })
      expect(fetcher.calls).toHaveLength(2)
    })

    it('state に、選んでいない候補の数と画像を取ったときの語を載せる', async () => {
      const { request } = setup(withImage())
      await request('POST', '/console/candidates', { id: '001', slot: 'w2' })
      const res = await request('GET', '/console/state', {})
      expect(res.payload.choices).toEqual({ '001:w2': 3 })
      expect(res.payload.candidates['001:w2'].word).toBe('マオ#コードギアス')
    })

    it('出した候補は set-image で採用でき、前の画像は history に残る', async () => {
      const { request, docs: stored } = setup(withImage())
      await request('POST', '/console/candidates', { id: '001', slot: 'w2' })
      const res = await request('POST', '/console/set-image', {
        id: '001',
        slot: 'w2',
        image: { hash: 'c2', url: 'https://evil.test/ignored.webp' },
      })
      expect(res.payload.ok).toBe(true)
      expect(stored['001:w2'].image).toMatchObject({
        hash: 'c2',
        url: 'https://example.test/c2.webp',
      })
      expect(stored['001:w2'].history[0].hash).toBe('cur')
      expect(stored['001:w2'].redo).toBeNull()
    })
  })
})

describe('handleConsoleRequest: 検索ワード', () => {
  it('語の略語タグは正式名に展開して検索する (Mac の一括と同じ)', async () => {
    const { request, fetcher, docs: stored } = setup()
    fetcher.queryOf = async (word, tagMap) => buildSearchWord(word, tagMap)
    await request('POST', '/console/redo-now', { id: '003', slot: 'w1' })
    expect(fetcher.calls[0].query).toBe('ミミ プリコネ')
    expect(stored['003:w1'].candidate.query).toBe('ミミ プリコネ')
  })

  it('候補の取得も同じ展開で検索する', async () => {
    const { request, fetcher } = setup()
    fetcher.queryOf = async (word, tagMap) => buildSearchWord(word, tagMap)
    const res = await request('POST', '/console/candidates', {
      id: '003',
      slot: 'w1',
    })
    expect(res.payload.query).toBe('ミミ プリコネ')
  })
})
