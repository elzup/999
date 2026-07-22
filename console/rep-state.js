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
