import type { NumberEntry } from '../data/schema'

export type EditableWordPatch = Partial<
  Pick<
    NumberEntry,
    | 'hito'
    | 'mono'
    | 'gainen'
    | 'w1'
    | 'w1k'
    | 'w2'
    | 'w2k'
    | 'wh1'
    | 'wh1k'
    | 'wh1Img'
    | 'wh2'
    | 'wh2k'
    | 'wh2Img'
    | 'wh3'
    | 'wh3k'
    | 'wh3Img'
    | 'wm1'
    | 'wm1k'
    | 'wm1Img'
    | 'wm2'
    | 'wm2k'
    | 'wm2Img'
    | 'wm3'
    | 'wm3k'
    | 'wm3Img'
  >
>

export async function fetchEditorWords(token: string): Promise<NumberEntry[]> {
  const res = await fetch('/api/editor/words', {
    headers: {
      authorization: `Bearer ${token}`,
    },
  })

  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `同期に失敗しました (${res.status})`)
  }

  return data.words
}

export async function saveWordPatch({
  num,
  token,
  patch,
}: {
  num: string
  token: string
  patch: EditableWordPatch
}): Promise<NumberEntry> {
  const res = await fetch(`/api/editor/words/${num}`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(patch),
  })

  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || `保存に失敗しました (${res.status})`)
  }

  return data.word
}
