// DB 移行の不変条件 (property-based) を、直す前の版と今の版の両方に当てて HTML にする。
// 性質はテストと同じもの (src/__tests__/helpers/symbols-db-shape.properties.js) を使う。
//
//   node scripts/report-db-migration-properties.ts [--before 41346ec] [--out .metarc/db-migration-properties.html]
//   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 node scripts/report-db-migration-properties.ts   (実データの件数も載せる)
//
// 直す前の版は git から取り出して一時ファイルに置く (import 先の model.js だけ今のものに向ける)。
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'
import fc from 'fast-check'
import * as currentShape from '../src/symbols/db-shape.js'
import {
  dbShapeProperties,
  migrate,
  numberDocArb,
  plain,
} from '../src/__tests__/helpers/symbols-db-shape.properties.js'

const { values: args } = parseArgs({
  options: {
    before: { type: 'string', default: '41346ec' },
    out: { type: 'string', default: '.metarc/db-migration-properties.html' },
  },
})

const ROOT = resolve(import.meta.dirname, '..')
// 毎回同じ入力で比べられるように固定する (シードを変えると反例の形も変わる)
const SEED = 42
const RUNS = 1000
const THEME = join(
  process.env.HOME ?? '',
  '.ghq/github.com/elzup/agent-setup/templates/report-inline-theme.sh'
)

const git = (...a: string[]) =>
  execFileSync('git', a, { cwd: ROOT, encoding: 'utf8' }).trim()

async function loadBeforeShape(rev: string) {
  const source = git('show', `${rev}:src/symbols/db-shape.js`)
  const modelUrl = pathToFileURL(join(ROOT, 'src/symbols/model.js')).href
  const file = join(mkdtempSync(join(tmpdir(), 'db-shape-')), `db-shape-${rev}.mjs`)
  writeFileSync(file, source.replaceAll("'./model.js'", `'${modelUrl}'`))
  return import(pathToFileURL(file).href)
}

type Result = {
  failed: boolean
  numRuns: number
  numShrinks: number
  counterexample: unknown
  message: string
}

function runProperty(p: { arb: fc.Arbitrary<unknown>; check: (v: unknown) => void }): Result {
  const details = fc.check(fc.property(p.arb, p.check), { seed: SEED, numRuns: RUNS })
  return {
    failed: details.failed,
    numRuns: details.numRuns,
    numShrinks: details.numShrinks,
    counterexample: details.counterexample?.[0],
    message: details.failed ? String((details.errorInstance as Error)?.message ?? '') : '',
  }
}

// ── 入力の内訳: 生成した文書が «壊れやすい形» をどれだけ含んだか ──

const COVERAGE: [string, (m: ReturnType<typeof migrate>, doc: any) => boolean][] = [
  ['代表がある', (_, d) => (d.rep?.picks.length ?? 0) > 0],
  ['評価がある', (_, d) => (d.ratings?.length ?? 0) > 0],
  ['枠の外 (4 項目目以降) の語がある', (m) => m.symbol.links.some((l: any) => l.order >= 3)],
  ['k: \'\' の代表・評価', (_, d) => [...(d.rep?.picks ?? []), ...(d.ratings ?? [])].some((r: any) => r.k === '')],
  ['k 欄なしの代表・評価', (_, d) => [...(d.rep?.picks ?? []), ...(d.ratings ?? [])].some((r: any) => !('k' in r))],
  ['出典 2 つで分けた項目', (m) => m.symbol.links.some((l: any, i: number) => m.symbol.links.some((o: any, j: number) => i !== j && o.order === l.order && m.wordsById[o.wordId].category === m.wordsById[l.wordId].category))],
  ['属性タグが出典より前 (sourceAt)', (m) => m.db.words.some((l: any) => l.sourceAt)],
  ['並びを作り直せない tags (rawTags)', (m) => m.db.words.some((l: any) => l.rawTags)],
  ['枠が空 (slotted: false)', (m) => m.symbol.links.some((l: any) => l.slotted === false)],
  ['語の ID にした代表', (m) => m.db.rep?.picks.some((p: any) => p.wordId) ?? false],
  ['文字列のまま残した代表', (m) => m.db.rep?.picks.some((p: any) => !p.wordId) ?? false],
  ['文字列のまま残した評価', (m) => (m.db.looseRatings?.length ?? 0) > 0],
  ['評価に古い欄 (stale)', (_, d) => (d.ratings ?? []).some((r: any) => r.stale)],
]

function coverage() {
  const docs = fc.sample(numberDocArb, { seed: SEED, numRuns: RUNS })
  const migrated = docs.map((doc) => ({ doc, m: migrate(currentShape, doc) }))
  return COVERAGE.map(([label, test]) => ({
    label,
    count: migrated.filter(({ doc, m }) => test(m, doc)).length,
  }))
}

// ── 実データ (emulator) ──

function realData() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) return null
  try {
    const out = execFileSync(
      'node',
      ['scripts/migrate-symbols.ts', '--project', 'demo-999'],
      { cwd: ROOT, encoding: 'utf8', env: process.env }
    )
    return JSON.parse(out)
  } catch (error) {
    // emulator が止まっていても可視化は出す。実データの欄に理由を残す
    return { error: String((error as Error).message).split('\n')[0] }
  }
}

// ── HTML ──

const esc = (s: unknown) =>
  String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] ?? c)
const json = (v: unknown) => JSON.stringify(plain(v), null, 1)

/** 行単位の差分 (LCS)。変わった行だけ del / ins にする */
function lineDiff(before: string, after: string) {
  const a = before.split('\n')
  const b = after.split('\n')
  const dp = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0))
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const left: string[] = []
  const right: string[] = []
  let i = 0
  let j = 0
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && a[i] === b[j]) {
      left.push(esc(a[i]))
      right.push(esc(b[j]))
      i++
      j++
    } else if (j < b.length && (i === a.length || dp[i][j + 1] >= dp[i + 1][j])) {
      right.push(`<ins>${esc(b[j++])}</ins>`)
    } else {
      left.push(`<del>${esc(a[i++])}</del>`)
    }
  }
  return { left: left.join('\n'), right: right.join('\n') }
}

const status = (r: Result | undefined) =>
  !r
    ? '<span class="status status--check">—</span>'
    : r.failed
      ? `<span class="status status--gap">FAIL</span><small>${r.numRuns} 件目で反例</small>`
      : `<span class="status status--match">PASS</span><small>${r.numRuns} 件</small>`

function counterexampleCard(p: any, r: Result, before: any) {
  const doc = r.counterexample
  const m = migrate(before, doc)
  const now = migrate(currentShape, doc)
  const focus = (s: any) => ({ rep: s.rep, ratings: s.ratings, links: s.links })
  const diff = lineDiff(json(focus(m.symbol)), json(focus(m.back)))
  return `
    <div class="ve-card ve-card--alert">
      <div class="ve-card__title">${esc(p.id)} ${esc(p.title)} <span class="status status--gap">直す前 (${esc(args.before)})</span></div>
      <p>縮めた反例 (shrink ${r.numShrinks} 回)。fast-check が «まだ落ちる一番小さい入力» まで削ったもの。</p>
      <details class="collapsible" open><summary>① 入力: 番号の文書</summary><div class="body"><pre><code>${esc(json(doc))}</code></pre></div></details>
      <details class="collapsible"><summary>② 移行後: symbols の文書 (直す前の版)</summary><div class="body"><pre><code>${esc(json(m.db))}</code></pre></div></details>
      <p>③ 元の symbol と、②から戻した symbol (代表・評価・結び付きだけ)。色の付いた行が往復で変わった所。</p>
      <div class="text-diff">
        <div class="text-diff__side text-diff__side--before"><div class="text-diff__label">元の symbol</div><pre><code>${diff.left}</code></pre></div>
        <div class="text-diff__side text-diff__side--after"><div class="text-diff__label">戻した symbol (直す前)</div><pre><code>${diff.right}</code></pre></div>
        <div class="text-diff__meta">assert: ${esc(r.message.split('\n')[0])}</div>
      </div>
      <p>今の版で同じ入力を通すと: 代表 ${esc(JSON.stringify(now.db.rep?.picks ?? []))} / 文字列のまま残した評価 ${esc(JSON.stringify(now.db.looseRatings ?? []))} → 往復の差分なし。</p>
    </div>`
}

function render(input: {
  props: any[]
  before: Result[]
  current: Result[]
  cov: { label: string; count: number }[]
  real: any
  beforeShape: any
}) {
  const { props, before, current, cov, real, beforeShape } = input
  const passNow = current.filter((r) => !r.failed).length
  const failBefore = props.filter((_, i) => before[i]?.failed)
  const head = git('rev-parse', '--short', 'HEAD')
  const rows = props
    .map(
      (p, i) => `
      <tr style="--i:${i}">
        <td class="item">${esc(p.id)}</td>
        <td class="wide"><b>${esc(p.title)}</b><small>${esc(p.guards)}</small></td>
        <td><code>${esc(p.code)}</code></td>
        <td>${status(before[i])}</td>
        <td>${status(current[i])}</td>
      </tr>`
    )
    .join('')
  const covRows = cov
    .map((c, i) => {
      const pct = (c.count / RUNS) * 100
      const color = c.count === 0 ? 'var(--red)' : pct < 5 ? 'var(--orange)' : 'var(--accent)'
      return `<tr style="--i:${i}"><td class="wide">${esc(c.label)}</td><td><div class="hbar"><i style="--w:${pct.toFixed(1)};--c:${color}"></i></div></td><td>${c.count} / ${RUNS}</td></tr>`
    })
    .join('')
  const realBlock = !real
    ? '<p class="sec-note">未計測。<code>FIRESTORE_EMULATOR_HOST=127.0.0.1:8080</code> を付けて実行すると、emulator の実データで dry-run した件数を載せる。</p>'
    : real.error
      ? `<div class="ve-card ve-card--warn"><p>emulator に繋がらなかった: ${esc(real.error)}</p></div>`
      : `<div class="table-wrap"><div class="table-scroll"><table class="data-table"><thead><tr><th>Item</th><th>件数</th></tr></thead><tbody>
          <tr><td class="item">元の文書</td><td>numbers ${real.source.numbers} / cards ${real.source.cards}</td></tr>
          <tr><td class="item">書く文書</td><td>symbols ${real.writes.symbols} / words ${real.writes.words}</td></tr>
          <tr><td class="item">代表</td><td>${real.refs.picks} 件中 ${real.refs.picks - real.refs.loosePicks} 件を語の ID、${real.refs.loosePicks} 件は文字列のまま</td></tr>
          <tr><td class="item">評価</td><td>${real.refs.ratings} 件中 ${real.refs.ratings - real.refs.looseRatings} 件を語の ID、${real.refs.looseRatings} 件は文字列のまま</td></tr>
        </tbody></table></div></div>`
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>DB 移行の不変条件</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&family=JetBrains+Mono:wght@400;500;700&family=Zen+Kaku+Gothic+New:wght@400;500;700&display=swap" rel="stylesheet">
<style>
/* @@THEME@@ */
</style>
</head>
<body>
<div class="wrap">
  <nav class="toc" id="toc">
    <div class="toc-title">Contents</div>
    <a href="#s1">1. 結論</a>
    <a href="#s2">2. 性質ごとの結果</a>
    <a href="#s3">3. 反例</a>
    <a href="#s4">4. 入力の内訳</a>
    <a href="#s5">5. 実データ</a>
    <a href="#s6">6. 読む場所</a>
  </nav>
  <div class="main">
    <div class="eyebrow">PROPERTY-BASED CHECK</div>
    <h1>DB 移行の不変条件</h1>
    <div class="subtitle">
      対象: <b>numbers → symbols / words</b> (<code>src/symbols/db-shape.js</code> / <code>mirror.js</code>)<br>
      比較: <b>直す前 ${esc(args.before)}</b> と <b>今 ${esc(head)}</b> ・ 各性質 ${RUNS} 件 ・ seed ${SEED}
    </div>

    <h2 class="sec-head" id="s1"><span class="num">01</span>結論</h2>
    <div class="ve-card ve-card--hero">
      <div class="ve-card__title">今の版は ${passNow} / ${props.length} 性質で反例なし <span class="status ${passNow === props.length ? 'status--match">PASS' : 'status--gap">FAIL'}</span></div>
      <ul class="tight">
        <li>直す前 (${esc(args.before)}) は ${failBefore.length ? failBefore.map((p) => `${esc(p.id)} ${esc(p.title)}`).join('、') + ' で反例が出る' : '反例なし'}。</li>
        <li>反例は、代表・評価の k と語のかなが «'' と欄なし» で食い違うと、往復で k が '' ⇄ 欄なし に変わる形 (向きはどちらも起きる)。<code>exactLink</code> がかなの '' と欄なしを同じに扱っていた。</li>
        <li>総当たりは «この入力の作り方で ${RUNS} 件» の範囲の保証。下の 4. で、壊れやすい形を十分に含んだかを見る。</li>
      </ul>
    </div>

    <h2 class="sec-head" id="s2"><span class="num">02</span>性質ごとの結果</h2>
    <p class="sec-note">P5 は鍵の文字列だけ、P6 は今の mirror.js を使うので、直す前と今で同じ結果になる。</p>
    <div class="table-wrap"><div class="table-scroll"><table class="data-table">
      <thead><tr><th>Item</th><th class="wide">性質</th><th>守っている側</th><th>直す前</th><th>今</th></tr></thead>
      <tbody>${rows}</tbody>
    </table></div></div>

    <h2 class="sec-head" id="s3"><span class="num">03</span>反例</h2>
    <p class="sec-note">直す前の版で破れた性質ごとに、入力 → 移行後 → 戻したもの を並べる。</p>
    ${failBefore.length ? props.map((p, i) => (before[i]?.failed ? counterexampleCard(p, before[i], beforeShape) : '')).join('') : '<p>反例なし。</p>'}
    ${current.some((r) => r.failed) ? props.map((p, i) => (current[i].failed ? `<div class="ve-card ve-card--alert"><div class="ve-card__title">${esc(p.id)} 今の版で反例</div><pre><code>${esc(json(current[i].counterexample))}</code></pre><p>${esc(current[i].message)}</p></div>` : '')).join('') : ''}

    <h2 class="sec-head" id="s4"><span class="num">04</span>入力の内訳</h2>
    <p class="sec-note">生成した ${RUNS} 件の文書のうち、その形を 1 つ以上含んだ件数。0 件 (赤) の形は検査されていない。5% 未満は橙。</p>
    <div class="table-wrap"><div class="table-scroll"><table class="data-table">
      <thead><tr><th class="wide">形</th><th>割合</th><th>件数</th></tr></thead>
      <tbody>${covRows}</tbody>
    </table></div></div>

    <h2 class="sec-head" id="s5"><span class="num">05</span>実データ (emulator)</h2>
    ${realBlock}

    <h2 class="sec-head" id="s6"><span class="num">06</span>読む場所</h2>
    <ul class="tight">
      <li>入力の作り方: <code>src/__tests__/helpers/symbols-db-shape.properties.js</code> の <code>numberDocArb</code></li>
      <li>性質の中身: 同じファイルの <code>dbShapeProperties</code> (P1〜P6 の check)</li>
      <li>検査される側: <code>src/symbols/db-shape.js</code> の <code>toDbSymbol</code> / <code>fromDbSymbol</code>、今回の修正は <code>exactLink</code> の <code>sameKana</code></li>
      <li>テストとして回す: <code>npx vitest run src/__tests__/symbols-db-shape.properties.test.js</code></li>
    </ul>

    <div class="footer-note">
      generated: node scripts/report-db-migration-properties.ts --before ${esc(args.before)}<br>
      source: src/__tests__/helpers/symbols-db-shape.properties.js (性質) / git ${esc(args.before)}:src/symbols/db-shape.js (直す前) / HEAD ${esc(head)} の作業ツリー (今)${real && !real.error ? ' / emulator demo-999 の numbers' : ''}<br>
      ${new Date().toISOString().slice(0, 16).replace('T', ' ')} &middot; 生成した入力での検査であり、全入力の証明ではない
    </div>
  </div>
</div>
<script>
(function() {
  const toc = document.getElementById('toc');
  if (!toc) return;
  const links = toc.querySelectorAll('a');
  const sections = [];
  links.forEach(link => {
    const el = document.getElementById(link.getAttribute('href').slice(1));
    if (el) sections.push({ el, link });
  });
  const observer = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      links.forEach(l => l.classList.remove('active'));
      const match = sections.find(s => s.el === entry.target);
      if (match) match.link.classList.add('active');
    });
  }, { rootMargin: '-10% 0px -80% 0px' });
  sections.forEach(s => observer.observe(s.el));
})();
</script>
</body>
</html>
`
}

async function main() {
  const beforeShape = await loadBeforeShape(args.before)
  const props = dbShapeProperties(currentShape)
  const beforeProps = dbShapeProperties(beforeShape)
  const before = beforeProps.map(runProperty)
  const current = props.map(runProperty)
  const html = render({ props, before, current, cov: coverage(), real: realData(), beforeShape })
  const out = resolve(ROOT, args.out)
  writeFileSync(out, html)
  execFileSync('bash', [THEME, out], { stdio: 'inherit' })
  if (!readFileSync(out, 'utf8').includes('--accent')) throw new Error(`theme not inlined: ${out}`)
  console.log(
    JSON.stringify({ out, before: before.map((r) => r.failed), current: current.map((r) => r.failed) })
  )
}

await main()
