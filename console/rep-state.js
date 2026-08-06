/** 保存成功時だけ対象番号の表示 state を不変更新する。 */
export function applySavedRep(state, num, saved) {
  if (!saved || saved.error) return state
  const index = state.words.findIndex((word) => word.num === num)
  if (index < 0) return state

  const updatedWord = {
    ...state.words[index],
    order: saved.order,
    confirmed: saved.confirmed,
    stale: [],
  }
  return {
    ...state,
    words: state.words.map((word, wordIndex) =>
      wordIndex === index ? updatedWord : word
    ),
  }
}

/** 保存成功時だけ対象候補の主観評価を不変更新する。代表・確定状態は触らない。 */
export function applySavedScore(state, num, slot, saved) {
  if (!saved || saved.error) return state
  const index = state.words.findIndex((word) => word.num === num)
  if (index < 0) return state

  const target = state.words[index]
  const cands = target.cands.map((cand) =>
    cand.slot === slot ? { ...cand, rate: saved.v } : cand
  )
  const updatedWord = {
    ...target,
    cands,
    rated: cands.filter((cand) => cand.rate !== null).length,
  }
  return {
    ...state,
    words: state.words.map((word, wordIndex) =>
      wordIndex === index ? updatedWord : word
    ),
  }
}
