// タグ違いの分割 (D-0039〜D-0041)。
//
// シートの 1 セル «カレン#res#ｺｰﾄﾞｷﾞｱｽ» は «カレン #res» と «カレン #ｺｰﾄﾞｷﾞｱｽ» の
// 2 人をまとめて書いたもの、と読む。出典ごとに画像も代表も別に持つので、
// 画面ではタグ 1 つずつの語に分けて出す。DB のスロットは 1 つのまま
// (シートのセルと 1:1 を保つ。人 / 物 3 枠の上限にもかからない)。
//
// 属性のタグ (#g 概念 / #i 身内) は出典ではなく語の性質なので分けず、
// 分けた語のどれにも残す。ラベル (-n など) も同じ。

import { TAG_MEANINGS, addTag, parseWord, removeTag } from './wordTags'

/** 分けない (語の性質を表す) タグか。TAG_MEANINGS に意味が登録されているもの */
export const isAttributeTag = (tag: string) =>
  Object.prototype.hasOwnProperty.call(TAG_MEANINGS, tag)

/** 語に付いた出典タグ (属性タグを除く)。書かれた順 */
export function sourceTags(word: string): string[] {
  return parseWord(word).tags.filter((tag) => !isAttributeTag(tag))
}

/**
 * 出典タグが 2 つ以上ある語を、出典タグ 1 つずつの語に分ける。
 * 1 つ以下ならそのまま 1 要素で返す。
 *
 * 文字列を組み立て直さず、他の出典タグを取り除くだけにする
 * (人が書いた注釈・属性タグ・ラベルの並びをそのまま残す)。
 */
export function splitVariants(word: string): string[] {
  const tags = sourceTags(word)
  if (tags.length < 2) return [word]
  return tags.map((keep) =>
    tags
      .filter((tag) => tag !== keep)
      .reduce((acc, tag) => removeTag(acc, tag), word)
  )
}

/** 分けた語の出典タグ。出典タグがちょうど 1 つの語だけ持つ (無い・複数なら null) */
export function variantTag(word: string): string | null {
  const tags = sourceTags(word)
  return tags.length === 1 ? tags[0] : null
}

/**
 * 同じ本体の語を 1 つにまとめる (splitVariants の逆。編集フォームの保存用)。
 * 並びは最初に出た位置を保つ。まとめ先は先頭の語で、後の語の出典タグを足していく。
 * 属性タグ・ラベルは先頭の語のものを使う (分けた語はどれも同じものを持つため)。
 */
export function mergeVariants(words: string[]): string[] {
  const merged: string[] = []
  const indexByBase = new Map<string, number>()
  for (const word of words) {
    const base = parseWord(word).base
    const at = base ? indexByBase.get(base) : undefined
    if (at === undefined) {
      if (base) indexByBase.set(base, merged.length)
      merged.push(word)
      continue
    }
    merged[at] = sourceTags(word).reduce(
      (acc, tag) => addTag(acc, tag),
      merged[at]
    )
  }
  return merged
}
