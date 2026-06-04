export type ChoiceVariant = 'full' | 'masked'
export type ChoiceOption = { value: string; display: string }

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const randomChunk = () =>
  String(Math.floor(Math.random() * 1000)).padStart(3, '0')

// 4択モードの選択肢を生成。
// full: 正解 + ランダム3桁ダミー3つ。
// masked: ランダムな1桁を X で隠す (X23 等)。見えている2桁が全選択肢で
//   重複しないようにし、正解を一意に特定できるようにする。
export function genChoiceOptions(
  correct: string,
  variant: ChoiceVariant
): ChoiceOption[] {
  if (variant === 'full') {
    const values = new Set<string>([correct])
    while (values.size < 4) values.add(randomChunk())
    return shuffle([...values].map((v) => ({ value: v, display: v })))
  }

  const maskPos = Math.floor(Math.random() * 3)
  const visibleOf = (s: string) => s.slice(0, maskPos) + s.slice(maskPos + 1)
  const usedVisible = new Set<string>([visibleOf(correct)])
  const values = new Set<string>([correct])
  while (values.size < 4) {
    const cand = randomChunk()
    const vis = visibleOf(cand)
    if (usedVisible.has(vis)) continue // 見える2桁が被ると特定不能になるので除外
    usedVisible.add(vis)
    values.add(cand)
  }
  return shuffle(
    [...values].map((v) => ({
      value: v,
      display: v.slice(0, maskPos) + 'X' + v.slice(maskPos + 1),
    }))
  )
}
