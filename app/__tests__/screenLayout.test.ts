import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// docs/screen-layout.md の規約が崩れていないかを、ソースを読んで確かめる。
// 操作部を CSS の order で下へ送る方式は、列挙漏れのクラスや flex でない親で
// 上に残るものが出た (f594f15)。同じ形に戻らないよう、その痕跡を禁止する。

const APP_DIR = join(__dirname, '..')
const COMPONENTS_DIR = join(APP_DIR, 'components')
// 呼び出されていない旧実装。載せ替えの対象外
const DEAD_FILES = new Set(['EditorTab.tsx'])

const componentFiles = readdirSync(COMPONENTS_DIR)
  .filter((name) => name.endsWith('.tsx') && !DEAD_FILES.has(name))
  .map((name) => ({
    name,
    src: readFileSync(join(COMPONENTS_DIR, name), 'utf8'),
  }))

const filesMatching = (pattern: RegExp, except: string[] = []) =>
  componentFiles
    .filter(({ name }) => !except.includes(name))
    .filter(({ src }) => pattern.test(src))
    .map(({ name }) => name)

describe('画面レイアウト規約', () => {
  it('style.css で order による並べ替えをしない', () => {
    const css = readFileSync(join(APP_DIR, 'style.css'), 'utf8')
    const orders = css
      .split('\n')
      .map((line, i) => ({ line: line.trim(), no: i + 1 }))
      .filter(({ line }) => /^order\s*:/.test(line))
    expect(orders).toEqual([])
  })

  it('テスト画面 (.test-screen) は Screen の isTest でだけ作る', () => {
    expect(filesMatching(/['"\s]test-screen['"\s]/, ['Screen.tsx'])).toEqual([])
  })

  it('サブタブの切り替えは SubTabGroup だけが描く', () => {
    expect(filesMatching(/sub-tab-switch/, ['SubTabGroup.tsx'])).toEqual([])
  })

  it('旧 Header / 上置きパネル / 下寄せ詰め物のクラスを使わない', () => {
    const legacy =
      /class="[^"]*\b(pi-header|year-header|kuku-header|sticky-wrap|test-feature-bar|content-bottom|d2-detail-header)\b/
    expect(filesMatching(legacy)).toEqual([])
  })

  it('テスト開始ボタンは 1 種類 (compact 指定を使わない)', () => {
    expect(filesMatching(/<TestFeatureList[^>]*\bcompact\b/)).toEqual([])
  })
})
