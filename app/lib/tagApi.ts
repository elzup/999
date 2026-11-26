// タグの名前を直す口 (正本は DB の sync/tagNames。D-0174)。保存できたら App へ知らせる
export type TagName = { tag: string; title: string; short: string }

/** App が受け取って tagNames / tagTitles を差し替える */
export const TAG_SAVED_EVENT = 'tag:saved'

export async function patchTagName(
  name: TagName,
  token: string
): Promise<TagName> {
  const res = await fetch(`/api/tags/${encodeURIComponent(name.tag)}`, {
    method: 'PATCH',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ title: name.title, short: name.short }),
  })
  const data = await res.json().catch(() => null)
  if (!res.ok || !data?.ok) {
    throw new Error(data?.error ?? `保存に失敗しました (${res.status})`)
  }
  const saved = { tag: data.tag, title: data.title, short: data.short }
  window.dispatchEvent(new CustomEvent(TAG_SAVED_EVENT, { detail: saved }))
  return saved
}
