// タグ (#g) とラベル (-n) の付いた語を、文字を並べずに語の見た目で表す。
//
//   鯉#g -n  →  «鯉» を斜体 (概念) + 点線下線 (馴染みがない) にし、右肩に «g» «n» を小さく
//
// 右肩の 1 文字でどのタグ・ラベルかを見分け、特に区別したい 2 つ
// (概念 #g と 馴染みがない -n) は語そのものの見た目でも分かるようにする。
import { h } from 'preact'
import { parseWord } from '../lib/wordTags'
import { tagNameOf, useTagNames } from '../lib/tagNames'

/** 語の見た目を変えるタグ・ラベル。ほかは右肩の文字だけ */
const STYLE_OF_TAG: Record<string, string> = { g: 'tw-concept' }
const STYLE_OF_LABEL: Record<string, string> = { n: 'tw-unfamiliar' }

export function hasMarks(word: string): boolean {
  const { tags, labels } = parseWord(word)
  return tags.length > 0 || labels.length > 0
}

/**
 * 右肩のタグは id ではなく表示名で出す (ipra → ｱｲﾄﾞﾘｰﾌﾟﾗｲﾄﾞ)。
 * 表示名はシートの short_title (省略表示用)、無ければ title (正式名)。どちらも無いタグだけ id。
 * showNames={false} は id のまま出す (使う所は無くした。比べたいときの逃げ道)
 */
function TaggedWord({
  word,
  showNames = true,
}: {
  word: string
  showNames?: boolean
}) {
  const { base, tags, labels } = parseWord(word)
  const names = useTagNames()
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
        // 略号 (ipra 等) は読み上げると雑音なので隠すが、表示名は語の説明なので読ませる
        <span class="tw-marks" aria-hidden={showNames ? undefined : 'true'}>
          {tags.map((t) => (
            <span
              key={'t' + t}
              class={'tw-tag' + (showNames ? ' tw-tag--name' : '')}
            >
              {showNames ? tagNameOf(t, names) : t}
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
