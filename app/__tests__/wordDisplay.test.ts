import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// 語 (コミー#tri -n のようにタグ・ラベルを埋め込んだ文字列) とタグを画面に出すときは、
// 必ず共通の口を通す (略称・正式名の使い分けを 1 か所で決めるため):
//   語を JSX に出す       → TaggedWord / TaggedList
//   語を文字だけで出す    → wordText (alt・title・aria-label・通知の文)
//   タグの名前            → useTagLabel().short / .title (tagNameOf / tagTitleOf)
// ソースを読んで、語やタグの id をそのまま出す書き方が戻っていないかを確かめる。

const COMPONENTS_DIR = join(__dirname, '..', 'components')
// 呼び出されていない旧実装 / 語ではなく固定の語源データを出すもの
const SKIP = new Set(['EditorTab.tsx', 'GogenTab.tsx'])

const files = readdirSync(COMPONENTS_DIR)
  .filter((name) => name.endsWith('.tsx') && !SKIP.has(name))
  .map((name) => ({
    name,
    lines: readFileSync(join(COMPONENTS_DIR, name), 'utf8').split('\n'),
  }))

const offending = (pattern: RegExp, allow: RegExp = /$^/) =>
  files.flatMap(({ name, lines }) =>
    lines
      .map((line, i) => ({ line: line.trim(), at: `${name}:${i + 1}` }))
      .filter(({ line }) => pattern.test(line) && !allow.test(line))
      .map(({ at, line }) => `${at} ${line}`)
  )

describe('語とタグの表示は共通の口を通す', () => {
  it('語を JSX の子にそのまま出さない (TaggedWord を使う)', () => {
    expect(offending(/(^|>)\s*\{\s*[\w.?]*\bword\s*\}\s*(<|$)/)).toEqual([])
  })

  it('alt・title・aria-label に語をそのまま入れない (wordText を使う)', () => {
    expect(
      offending(
        /\b(alt|title|aria-label)=\{[^}]*\bword\b/,
        // 語を比べるだけ (代表の何番目か)・見出しの定数は語を出していない
        /wordText\(|repRankOf\(|QUIZ_TITLE\./
      )
    ).toEqual([])
  })

  it('タグの id を «#tag» のまま組み立てて出さない (表示名・正式名を使う)', () => {
    expect(offending(/#\$\{\s*[\w.?]*\btag\b/)).toEqual([])
  })
})
