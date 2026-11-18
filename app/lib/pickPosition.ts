// 候補タブの «代表» と «画像» で、見ている番号の位置を共有する。
// 百の位は同じキーに保存し、切り替えるときは画面に見えている番号を覚えて、
// 切り替えた先で同じ番号の行 (無ければその次の番号) を画面の下端に合わせる。
// 一覧は下から上へ積む (stack-up / grid-up) ので、先頭の番号が親指側 = 下端。
import { loadSubTab, saveSubTab } from '../data/storage'

export const HUNDRED_KEY = 'rep.hundred'
export const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']

export const loadHundred = () => loadSubTab(HUNDRED_KEY, DIGITS, '0')
export const saveHundred = (hundred: string) => saveSubTab(HUNDRED_KEY, hundred)

const isNum = (value: string | undefined): value is string =>
  Boolean(value && /^\d{3}$/.test(value))

/** 画面の一覧に見えている番号のうち、いちばん小さいもの (下端に近い行)。見えていなければ null */
export function visibleAnchorNum(root: ParentNode = document): string | null {
  const scroller = root.querySelector('.screen-main')
  if (!scroller) return null
  const view = scroller.getBoundingClientRect()
  let anchor: string | null = null
  scroller.querySelectorAll<HTMLElement>('[data-num]').forEach((el) => {
    const num = el.dataset.num
    if (!isNum(num)) return
    const rect = el.getBoundingClientRect()
    const isVisible = rect.bottom > view.top && rect.top < view.bottom
    if (isVisible && (anchor === null || num < anchor)) anchor = num
  })
  return anchor
}

/** 一覧の中で anchor 以上の最初の番号を選ぶ (並びは番号順) */
export function anchorTarget(nums: string[], anchor: string): string | null {
  return nums.find((num) => num >= anchor) ?? nums[nums.length - 1] ?? null
}

/** anchor の番号の行を画面の下端に合わせる。合わせられたら true */
export function scrollToNum(selector: string, num: string): boolean {
  const el = document.querySelector(`${selector} [data-num="${num}"]`)
  if (!el) return false
  el.scrollIntoView({ block: 'end' })
  return true
}
