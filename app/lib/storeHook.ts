// zustand の vanilla ストアを Preact から購読するフック (imageStore / symbolStore で共用)。
// zustand の React 用フックは react を要るので、Preact の hooks で同じことをする。
import { useEffect, useRef, useState } from 'preact/hooks'
import type { StoreApi } from 'zustand/vanilla'

/** ストアの一部を購読する。selector の結果が変わったときだけ描き直す */
export function useStoreSelector<S, T>(
  store: StoreApi<S>,
  selector: (state: S) => T,
  equal: (a: T, b: T) => boolean = Object.is
): T {
  const selectorRef = useRef(selector)
  selectorRef.current = selector
  const [value, setValue] = useState(() => selector(store.getState()))
  const valueRef = useRef(value)
  valueRef.current = value
  useEffect(() => {
    const check = (state: S) => {
      const next = selectorRef.current(state)
      if (!equal(valueRef.current, next)) {
        valueRef.current = next
        setValue(() => next)
      }
    }
    // 描画から購読までの間に変わった分も拾う
    check(store.getState())
    return store.subscribe(check)
  }, [store])
  // selector の引数 (id / slot / word) が変わった描画では、その場で読み直す
  const now = selector(store.getState())
  return equal(value, now) ? value : now
}

/** 配列を中身の同一性 (Object.is) で比べる。selector が毎回新しい配列を返すとき用 */
export const sameItems = <T>(a: readonly T[], b: readonly T[]) =>
  a.length === b.length && a.every((item, i) => Object.is(item, b[i]))
