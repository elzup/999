// タグ (#g) とラベル (-n) の付いた語を、文字を並べずに語の見た目で表す。
//
//   鯉#g -n  →  «鯉» を斜体 (概念) + 点線下線 (馴染みがない) にし、右肩に «g» «n» を小さく
//
// 右肩の 1 文字でどのタグ・ラベルかを見分け、特に区別したい 2 つ
// (概念 #g と 馴染みがない -n) は語そのものの見た目でも分かるようにする。
import { h } from 'preact'
import { parseWord } from '../lib/wordTags'

/** 語の見た目を変えるタグ・ラベル。ほかは右肩の文字だけ */
const STYLE_OF_TAG: Record<string, string> = { g: 'tw-concept' }
const STYLE_OF_LABEL: Record<string, string> = { n: 'tw-unfamiliar' }

export function hasMarks(word: string): boolean {
  const { tags, labels } = parseWord(word)
  return tags.length > 0 || labels.length > 0
}

function TaggedWord({ word }: { word: string }) {
  const { base, tags, labels } = parseWord(word)
  const cls = [
    'tw-base',
    ...tags.map((t) => STYLE_OF_TAG[t]),
    ...labels.map((l) => STYLE_OF_LABEL[l]),
  ]
    .filter(Boolean)
    .join(' ')
  return (
    <span class="tw">
      <span class={cls}>{base}</span>
      {tags.length || labels.length ? (
        <span class="tw-marks" aria-hidden="true">
          {tags.map((t) => (
            <span key={'t' + t} class="tw-tag">
              {t}
            </span>
          ))}
          {labels.map((l) => (
            <span key={'l' + l} class="tw-label">
              {l}
            </span>
          ))}
        </span>
      ) : null}
    </span>
  )
}

export default TaggedWord
