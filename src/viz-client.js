/* global React, ReactDOM, htm */
const { useState, useEffect, useMemo, useCallback, useRef, useLayoutEffect, memo } = React
const html = htm.bind(React.createElement)

// ─── Helpers ────────────────────────────────────────────

function compCount(d) {
  let n = 0
  if (d.hito) n++
  if (d.mono) n++
  if (d.gainen) n++
  if (d.w1k) n++
  return n
}

const modeClassMap = {
  completion: (d) => 'comp-' + compCount(d),
  category: (d) => {
    const s = d.catScore
    if (s === 0) return 'cat-0'
    if (s <= 10) return 'cat-1'
    if (s <= 20) return 'cat-2'
    if (s <= 30) return 'cat-3'
    if (s <= 50) return 'cat-4'
    return 'cat-5'
  },
  encode: (d) => {
    const s = bestScore(d)
    if (s === null) {
      if ((d.w1k && d.w1Error) || (d.w2k && d.w2Error)) return 'enc-err'
      return 'enc-none'
    }
    if (s < 20) return 'enc-low'
    if (s < 30) return 'enc-mid'
    if (s < 40) return 'enc-high'
    return 'enc-max'
  },
}

const modeLabelMap = {
  completion: (d) => (compCount(d) === 0 ? '' : d.num),
  category: (d) => (d.catScore > 0 ? d.num : ''),
  encode: (d) => (d.w1k || d.w2k ? d.num : ''),
}

const LEGENDS = {
  completion: [
    { cls: 'comp-4', label: '4/4 ALL' },
    { cls: 'comp-3', label: '3/4' },
    { cls: 'comp-2', label: '2/4' },
    { cls: 'comp-1', label: '1/4' },
    { cls: 'comp-0', label: '0/4' },
  ],
  category: [
    { cls: 'cat-5', label: '51+' },
    { cls: 'cat-4', label: '31-50' },
    { cls: 'cat-3', label: '21-30' },
    { cls: 'cat-2', label: '11-20' },
    { cls: 'cat-1', label: '1-10' },
    { cls: 'cat-0', label: '0' },
  ],
  encode: [
    { cls: 'enc-max', label: '40+ (max)' },
    { cls: 'enc-high', label: '30-39' },
    { cls: 'enc-mid', label: '20-29' },
    { cls: 'enc-low', label: '<20' },
    { cls: 'enc-err', label: 'Error' },
    { cls: 'enc-none', label: 'No word' },
  ],
}

const SUMMARY_LEGENDS = {
  completion: [
    { cls: 'sg-5', label: '10/10' },
    { cls: 'sg-4', label: '8-9' },
    { cls: 'sg-3', label: '6-7' },
    { cls: 'sg-2', label: '4-5' },
    { cls: 'sg-1', label: '1-3' },
    { cls: 'sg-0', label: '0' },
  ],
  category: [
    { cls: 'sg-5', label: '351+' },
    { cls: 'sg-4', label: '201-350' },
    { cls: 'sg-3', label: '101-200' },
    { cls: 'sg-2', label: '51-100' },
    { cls: 'sg-1', label: '1-50' },
    { cls: 'sg-0', label: '0' },
  ],
  encode: [
    { cls: 'sg-5', label: '35+' },
    { cls: 'sg-4', label: '30-34' },
    { cls: 'sg-3', label: '25-29' },
    { cls: 'sg-2', label: '15-24' },
    { cls: 'sg-1', label: '<15' },
    { cls: 'sg-0', label: 'None' },
  ],
}

function bestScore(d) {
  const scores = []
  if (d.w1Score !== null && !d.w1Error) scores.push(d.w1Score)
  if (d.w2Score !== null && !d.w2Error) scores.push(d.w2Score)
  return scores.length > 0 ? Math.max(...scores) : null
}

const summaryResolvers = {
  completion: (items) => {
    const filled = items.filter((d) => compCount(d) === 4).length
    return {
      label: filled > 0 ? '' + filled : '',
      cls: 'sg-' + Math.min(Math.floor(filled / 2), 5),
    }
  },
  category: (items) => {
    const t = items.reduce((s, d) => s + d.catScore, 0)
    const cls =
      t === 0
        ? 'sg-0'
        : t <= 50
          ? 'sg-1'
          : t <= 100
            ? 'sg-2'
            : t <= 200
              ? 'sg-3'
              : t <= 350
                ? 'sg-4'
                : 'sg-5'
    return { label: t > 0 ? '' + t : '', cls }
  },
  encode: (items) => {
    const scored = items.map((d) => bestScore(d)).filter((s) => s !== null)
    if (scored.length === 0) return { label: '', cls: 'sg-0' }
    const avg = scored.reduce((a, b) => a + b, 0) / scored.length
    const cls =
      avg < 15
        ? 'sg-1'
        : avg < 25
          ? 'sg-2'
          : avg < 30
            ? 'sg-3'
            : avg < 35
              ? 'sg-4'
              : 'sg-5'
    return { label: avg.toFixed(0), cls }
  },
}

// ─── Kana data ──────────────────────────────────────────

const VOWELS = ['あ', 'い', 'う', 'え', 'お']
const SEION = [
  { l: 'あ', k: ['あ', 'い', 'う', 'え', 'お'] },
  { l: 'か', k: ['か', 'き', 'く', 'け', 'こ'] },
  { l: 'さ', k: ['さ', 'し', 'す', 'せ', 'そ'] },
  { l: 'た', k: ['た', 'ち', 'つ', 'て', 'と'] },
  { l: 'な', k: ['な', 'に', 'ぬ', 'ね', 'の'] },
  { l: 'は', k: ['は', 'ひ', 'ふ', 'へ', 'ほ'] },
  { l: 'ま', k: ['ま', 'み', 'む', 'め', 'も'] },
  { l: 'や', k: ['や', null, 'ゆ', null, 'よ'] },
  { l: 'ら', k: ['ら', 'り', 'る', 'れ', 'ろ'] },
  { l: 'わ', k: ['わ', null, null, null, 'を'] },
  { l: 'ん', k: ['ん'] },
]
const DAKUON = [
  { l: 'が', k: ['が', 'ぎ', 'ぐ', 'げ', 'ご'] },
  { l: 'ざ', k: ['ざ', 'じ', 'ず', 'ぜ', 'ぞ'] },
  { l: 'だ', k: ['だ', 'ぢ', 'づ', 'で', 'ど'] },
  { l: 'ば', k: ['ば', 'び', 'ぶ', 'べ', 'ぼ'] },
  { l: 'ぱ', k: ['ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ'] },
]
const YOUON_H = ['ゃ', 'ゅ', 'ょ']
const YOUON = [
  { l: 'き', k: ['きゃ', 'きゅ', 'きょ'] },
  { l: 'し', k: ['しゃ', 'しゅ', 'しょ'] },
  { l: 'ち', k: ['ちゃ', 'ちゅ', 'ちょ'] },
  { l: 'に', k: ['にゃ', 'にゅ', 'にょ'] },
  { l: 'ひ', k: ['ひゃ', 'ひゅ', 'ひょ'] },
  { l: 'み', k: ['みゃ', 'みゅ', 'みょ'] },
  { l: 'り', k: ['りゃ', 'りゅ', 'りょ'] },
  { l: 'じ', k: ['じゃ', 'じゅ', 'じょ'] },
]

const SHOWN_KANA = new Set()
;[SEION, DAKUON, YOUON].forEach((grp) =>
  grp.forEach((r) =>
    r.k.forEach((k) => {
      if (k) SHOWN_KANA.add(k)
    })
  )
)
SHOWN_KANA.add('っ')

// ─── Components ─────────────────────────────────────────

function SummaryCards({ stats }) {
  const { total, hasHito, hasMono, hasGainen, hasW1k, hasAll, totalCatScore, avgEnc, encErrors } = stats
  const pct = (n) => ((n / total) * 100).toFixed(1) + '%'
  const cards = [
    { label: 'Total', value: total, cls: '' },
    { label: '人', value: hasHito, sub: pct(hasHito), cls: 'blue' },
    { label: '物', value: hasMono, sub: pct(hasMono), cls: 'green' },
    { label: '概念', value: hasGainen, sub: pct(hasGainen), cls: 'yellow' },
    { label: 'w1k', value: hasW1k, sub: pct(hasW1k), cls: 'green' },
    { label: 'All filled', value: hasAll, sub: pct(hasAll), cls: 'green' },
    { label: 'Cat Score', value: totalCatScore, cls: 'yellow' },
    { label: 'Enc Avg', value: avgEnc, cls: 'green' },
    { label: 'Enc Errors', value: encErrors, cls: encErrors > 0 ? 'red' : 'green' },
  ]
  return html`
    <div className="summary">
      ${cards.map(
        (c) => html`
          <div className="summary-card" key=${c.label}>
            <div className="label">${c.label}</div>
            <div className=${'value ' + c.cls}>${c.value}</div>
            ${c.sub && html`<div className="sub">${c.sub}</div>`}
          </div>
        `
      )}
    </div>
  `
}

function ProgressBars({ stats }) {
  const { total, hasHito, hasMono, hasGainen, hasW1k, hasAll } = stats
  const items = [
    { label: '人', count: hasHito, cls: 'hito' },
    { label: '物', count: hasMono, cls: 'mono' },
    { label: '概念', count: hasGainen, cls: 'gainen' },
    { label: 'w1k', count: hasW1k, cls: 'w1k' },
    { label: 'All', count: hasAll, cls: 'all' },
  ]
  return html`
    <div className="progress-section">
      ${items.map((p) => {
        const pct = ((p.count / total) * 100).toFixed(1)
        return html`
          <div className="prog-row" key=${p.label}>
            <span className="prog-label">${p.label}</span>
            <div className="prog-bar-bg">
              <div className=${'prog-bar ' + p.cls} style=${{ width: pct + '%' }}>
                ${pct > 8 ? p.count : ''}
              </div>
            </div>
            <span className="prog-count">${p.count} / ${total}</span>
          </div>
        `
      })}
    </div>
  `
}

function ModeSwitcher({ mode, onChange, prefix = 'mode' }) {
  const p = prefix
  return html`
    <div className="mode-switcher">
      <input type="radio" name=${p} id=${p + '-comp'} value="completion"
        checked=${mode === 'completion'} onChange=${() => onChange('completion')} />
      <label htmlFor=${p + '-comp'}>Completion</label>
      <input type="radio" name=${p} id=${p + '-cat'} value="category"
        checked=${mode === 'category'} onChange=${() => onChange('category')} />
      <label htmlFor=${p + '-cat'}>Category Score</label>
      <input type="radio" name=${p} id=${p + '-enc'} value="encode"
        checked=${mode === 'encode'} onChange=${() => onChange('encode')} />
      <label htmlFor=${p + '-enc'}>Encode Score</label>
    </div>
  `
}

function Legend({ items }) {
  return html`
    <div className="legend">
      ${items.map(
        (it) => html`
          <div className="legend-item" key=${it.cls}>
            <div className=${'legend-swatch ' + it.cls}></div>
            <span>${it.label}</span>
          </div>
        `
      )}
    </div>
  `
}

const MainHeatmap = memo(function MainHeatmap({ byNum, mode, onMouseMove, onMouseLeave }) {
  const resolver = modeClassMap[mode]
  const labelFn = modeLabelMap[mode]
  return html`
    <div className="heatmap-wrap">
      <table className="heatmap" onMouseMove=${onMouseMove} onMouseLeave=${onMouseLeave}>
        <tr>
          <th className="corner">YZ\\X</th>
          ${Array.from({ length: 10 }, (_, z) => html`<th key=${z}>${z}</th>`)}
        </tr>
        ${Array.from({ length: 100 }, (_, i) => {
          const x = Math.floor(i / 10)
          const y = i % 10
          const sep = y === 0 ? ' x-separator' : ''
          return html`
            <tr key=${'' + x + y}>
              <td className=${'row-header' + sep}>${'' + x + y}</td>
              ${Array.from({ length: 10 }, (_, z) => {
                const num = '' + x + y + z
                const d = byNum[num]
                if (!d) return html`<td key=${z} className=${'comp-0' + sep}>${num}</td>`
                return html`<td key=${z} className=${resolver(d) + sep} data-num=${num}>${labelFn(d) || num}</td>`
              })}
            </tr>
          `
        })}
      </table>
    </div>
  `
})

function SumModeSwitcher({ sumMode, onChange }) {
  return html`
    <div className="mode-switcher">
      <input type="radio" name="sumMode" id="sum-xy" value="xy"
        checked=${sumMode === 'xy'} onChange=${() => onChange('xy')} />
      <label htmlFor="sum-xy">XY (先頭2桁)</label>
      <input type="radio" name="sumMode" id="sum-yz" value="yz"
        checked=${sumMode === 'yz'} onChange=${() => onChange('yz')} />
      <label htmlFor="sum-yz">YZ (末尾2桁)</label>
      <input type="radio" name="sumMode" id="sum-both" value="both"
        checked=${sumMode === 'both'} onChange=${() => onChange('both')} />
      <label htmlFor="sum-both">XY+YZ (合成)</label>
    </div>
  `
}

const SummaryHeatmapTable = memo(function SummaryHeatmapTable({ byNum, mode, sumMode }) {
  const resolver = summaryResolvers[mode]

  function groupItems(row, col) {
    const items = []
    for (let d = 0; d <= 9; d++) {
      let num
      if (sumMode === 'xy') num = '' + row + col + d
      else if (sumMode === 'yz') num = '' + d + row + col
      else num = '' + row + col + d
      const entry = byNum[num]
      if (entry) items.push(entry)
    }
    if (sumMode === 'both') {
      for (let d = 0; d <= 9; d++) {
        const num = '' + d + row + col
        const entry = byNum[num]
        if (entry && !items.includes(entry)) items.push(entry)
      }
    }
    return items
  }

  const cornerLabel = sumMode === 'xy' ? 'X\\Y' : sumMode === 'yz' ? 'Y\\Z' : 'R\\C'
  const rowLabel = sumMode === 'yz' ? (r) => 'Y=' + r : sumMode === 'both' ? (r) => r : (r) => r
  const colLabel = sumMode === 'yz' ? (c) => c : sumMode === 'both' ? (c) => c : (c) => c

  return html`
    <div className="heatmap-wrap">
      <table className="heatmap summary-heatmap">
        <tr>
          <th className="corner">${cornerLabel}</th>
          ${Array.from({ length: 10 }, (_, c) => html`<th key=${c}>${colLabel(c)}</th>`)}
        </tr>
        ${Array.from({ length: 10 }, (_, r) => html`
          <tr key=${r}>
            <td className="row-header">${rowLabel(r)}</td>
            ${Array.from({ length: 10 }, (_, c) => {
              const r2 = resolver(groupItems(r, c))
              return html`<td key=${c} className=${r2.cls}>${r2.label}</td>`
            })}
          </tr>
        `)}
      </table>
    </div>
  `
})

function RuleCharts({ ruleStats }) {
  const scored = ruleStats.scoredCount || 1
  const patEntries = Object.entries(ruleStats.patterns).sort((a, b) => b[1] - a[1])
  const patMax = patEntries.length > 0 ? patEntries[0][1] : 1
  const patClsMap = { 'DD+D': 'pat-dd-d', 'D+DD': 'pat-d-dd', 'D+D+D': 'pat-d-d-d' }

  const tokOrder = [
    { key: 'double', label: 'double (2桁)', cls: 'tok-double' },
    { key: 'core', label: 'single core', cls: 'tok-core' },
    { key: 'sub', label: 'single sub', cls: 'tok-sub' },
    { key: 'bad', label: 'single bad', cls: 'tok-bad' },
    { key: 'sokuon', label: 'sokuon (っ)', cls: 'tok-sokuon' },
    { key: 'halfOverflow', label: 'halfOverflow', cls: 'tok-half' },
    { key: 'overflow', label: 'overflow', cls: 'tok-overflow' },
  ]
  const tokMax = Math.max(...tokOrder.map((t) => ruleStats.tokenTypes[t.key] || 0), 1)
  const totalTokens = Object.values(ruleStats.tokenTypes).reduce((a, b) => a + b, 0) || 1

  return html`
    <div className="rule-columns">
      <div className="rule-col">
        <h2>Pattern Distribution</h2>
        <p className="subtitle">分解パターン別エントリ数</p>
        <div className="rule-section">
          ${patEntries.map(([pat, cnt]) => {
            const pct = ((cnt / scored) * 100).toFixed(1)
            const barW = ((cnt / patMax) * 100).toFixed(1)
            const cls = patClsMap[pat] || 'pat-other'
            return html`
              <div className="rule-row" key=${pat}>
                <span className="rule-label">${pat}</span>
                <div className="rule-bar-bg">
                  <div className=${'rule-bar ' + cls} style=${{ width: barW + '%' }}>${barW > 15 ? cnt : ''}</div>
                </div>
                <span className="rule-count">${cnt} (${pct}%)</span>
              </div>
            `
          })}
          ${ruleStats.youon4Count > 0 &&
          html`
            <div className="rule-row" style=${{ marginTop: '8px' }}>
              <span className="rule-label" style=${{ color: '#fbbf24' }}>拗音4省略</span>
              <span className="rule-count">
                ${ruleStats.youon4Count} (${((ruleStats.youon4Count / scored) * 100).toFixed(1)}%)
              </span>
            </div>
          `}
        </div>
      </div>
      <div className="rule-col">
        <h2>Token Type Distribution</h2>
        <p className="subtitle">トークン種別の出現回数</p>
        <div className="rule-section">
          ${tokOrder.map((t) => {
            const cnt = ruleStats.tokenTypes[t.key] || 0
            if (cnt === 0) return null
            const pct = ((cnt / totalTokens) * 100).toFixed(1)
            const barW = ((cnt / tokMax) * 100).toFixed(1)
            return html`
              <div className="rule-row" key=${t.key}>
                <span className="rule-label">${t.label}</span>
                <div className="rule-bar-bg">
                  <div className=${'rule-bar ' + t.cls} style=${{ width: barW + '%' }}>${barW > 15 ? cnt : ''}</div>
                </div>
                <span className="rule-count">${cnt} (${pct}%)</span>
              </div>
            `
          })}
        </div>
      </div>
    </div>
  `
}

function KanaUsage({ ruleStats }) {
  const ku = ruleStats.kanaUsage || {}
  const kuVals = Object.values(ku)
  const kuMax = kuVals.length > 0 ? Math.max(...kuVals) : 1

  function getCls(c) {
    if (!c) return 'ku0'
    const r = c / kuMax
    if (r < 0.05) return 'ku1'
    if (r < 0.15) return 'ku2'
    if (r < 0.35) return 'ku3'
    if (r < 0.65) return 'ku4'
    return 'ku5'
  }

  function KanaTd({ k }) {
    if (!k) return html`<td className="ku0"></td>`
    const c = ku[k] || 0
    return html`
      <td className=${getCls(c)}>
        <span className="kc">${k}</span><span className="kn">${c}</span>
      </td>
    `
  }

  function KanaGrid({ title, cols, rows }) {
    return html`
      <div>
        <h3 style=${{ color: '#ccc', fontSize: '14px', margin: '0 0 6px' }}>${title}</h3>
        <table className="kana-grid">
          <tr>
            <th className="rl"></th>
            ${cols.map((c) => html`<th key=${c}>${c}</th>`)}
          </tr>
          ${rows.map(
            (row) => html`
              <tr key=${row.l}>
                <td className="rl">${row.l}</td>
                ${row.k.map((k, j) => html`<${KanaTd} key=${j} k=${k} />`)}
                ${Array.from({ length: Math.max(0, cols.length - row.k.length) }, (_, j) =>
                  html`<td key=${'p' + j} className="ku0"></td>`
                )}
              </tr>
            `
          )}
        </table>
      </div>
    `
  }

  const others = Object.keys(ku)
    .filter((k) => !SHOWN_KANA.has(k))
    .sort((a, b) => (ku[b] || 0) - (ku[a] || 0))

  return html`
    <div>
      <div className="kana-grids">
        <${KanaGrid} title="清音" cols=${VOWELS} rows=${SEION} />
        <${KanaGrid} title="濁音・半濁音" cols=${VOWELS} rows=${DAKUON} />
        <${KanaGrid} title="拗音" cols=${YOUON_H} rows=${YOUON} />
      </div>
      <div className="kana-grids" style=${{ marginTop: '8px' }}>
        <div>
          <h3 style=${{ color: '#ccc', fontSize: '14px', margin: '0 0 6px' }}>促音</h3>
          <div className=${'ku-badge ' + getCls(ku['っ'] || 0)}>
            っ<span className="kn">${ku['っ'] || 0}</span>
          </div>
        </div>
        ${others.length > 0 &&
        html`
          <div>
            <h3 style=${{ color: '#ccc', fontSize: '14px', margin: '0 0 6px' }}>その他</h3>
            <div className="ku-others">
              ${others.map(
                (k) => html`
                  <div key=${k} className=${'ku-chip ' + getCls(ku[k] || 0)}>
                    <span className="kc">${k}</span><span className="kn">${ku[k] || 0}</span>
                  </div>
                `
              )}
            </div>
          </div>
        `}
      </div>
    </div>
  `
}

function Tooltip({ d, x, y }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    if (!ref.current) return
    const tt = ref.current
    let left = x + 16
    let top = y + 16
    tt.style.left = left + 'px'
    tt.style.top = top + 'px'
    const rect = tt.getBoundingClientRect()
    if (rect.right > window.innerWidth) tt.style.left = x - rect.width - 8 + 'px'
    if (rect.bottom > window.innerHeight) tt.style.top = y - rect.height - 8 + 'px'
  })
  if (!d) return null
  const w1ScoreEl = d.w1Error
    ? html`<span className="tt-red">ERROR</span>`
    : d.w1Score !== null
      ? html`<span className="tt-green">${d.w1Score}</span>`
      : html`<span className="tt-gray">-</span>`
  const w2ScoreEl = d.w2Error
    ? html`<span className="tt-red">ERROR</span>`
    : d.w2Score !== null
      ? html`<span className="tt-green">${d.w2Score}</span>`
      : html`<span className="tt-gray">-</span>`
  return html`
    <div className="tooltip" ref=${ref} style=${{ display: 'block' }}>
      <div className="tt-num">${d.num}</div>
      ${d.hito &&
      html`<div className="tt-row">
        <span className="tt-label">人: </span><span className="tt-val">${d.hito}</span>
        ${' '}<span className="tt-label">(${d.hitoCnt}×8=${d.hitoCnt * 8})</span>
      </div>`}
      ${d.mono &&
      html`<div className="tt-row">
        <span className="tt-label">物: </span><span className="tt-val">${d.mono}</span>
        ${' '}<span className="tt-label">(${d.monoCnt}×10=${d.monoCnt * 10})</span>
      </div>`}
      ${d.gainen &&
      html`<div className="tt-row">
        <span className="tt-label">概念: </span><span className="tt-val">${d.gainen}</span>
        ${' '}<span className="tt-label">(${d.gainenCnt}×4=${d.gainenCnt * 4})</span>
      </div>`}
      <div className="tt-row">
        <span className="tt-label">Cat Score: </span>
        <span className="tt-score tt-green">${d.catScore}</span>
      </div>
      ${d.w1 &&
      html`
        <div className="tt-row">
          <span className="tt-label">w1: </span><span className="tt-val">${d.w1}</span>
        </div>
        ${d.w1k &&
        html`<div className="tt-row">
          <span className="tt-label">w1k: </span><span className="tt-kana">${d.w1k}</span>
          ${' → '}${w1ScoreEl}
          ${d.w1Pattern && html`${' '}<span className="tt-label">[${d.w1Pattern}]</span>`}
        </div>`}
      `}
      ${d.w2 &&
      html`
        <div className="tt-row">
          <span className="tt-label">w2: </span><span className="tt-val">${d.w2}</span>
        </div>
        ${d.w2k &&
        html`<div className="tt-row">
          <span className="tt-label">w2k: </span><span className="tt-kana">${d.w2k}</span>
          ${' → '}${w2ScoreEl}
        </div>`}
      `}
    </div>
  `
}

// ─── App ────────────────────────────────────────────────

function App() {
  const [data, setData] = useState(null)
  const [ruleStats, setRuleStats] = useState(null)
  const [mode, setMode] = useState('encode')
  const [sumMode, setSumMode] = useState('xy')
  const [tooltip, setTooltip] = useState(null)

  useEffect(() => {
    const params = new URLSearchParams(location.search)
    const dataFile = params.get('data') || './visualize-words.data.json'
    fetch(dataFile)
      .then((r) => {
        if (!r.ok) throw new Error('Failed to load ' + dataFile)
        return r.json()
      })
      .then((json) => {
        setData(json.data)
        setRuleStats(json.ruleStats)
      })
      .catch((err) => {
        document.getElementById('root').textContent = err.message
      })
  }, [])

  const byNum = useMemo(() => {
    if (!data) return {}
    const map = {}
    for (const d of data) map[d.num] = d
    return map
  }, [data])

  const stats = useMemo(() => {
    if (!data) return null
    const total = data.length
    const hasHito = data.filter((d) => d.hito).length
    const hasMono = data.filter((d) => d.mono).length
    const hasGainen = data.filter((d) => d.gainen).length
    const hasW1k = data.filter((d) => d.w1k).length
    const hasAll = data.filter((d) => d.hito && d.mono && d.gainen && d.w1k).length
    const totalCatScore = data.reduce((s, d) => s + d.catScore, 0)
    const validScores = data.filter((d) => d.w1Score !== null && !d.w1Error)
    const avgEnc =
      validScores.length > 0
        ? (validScores.reduce((s, d) => s + d.w1Score, 0) / validScores.length).toFixed(1)
        : '-'
    const encErrors = data.filter((d) => d.w1Error).length
    return { total, hasHito, hasMono, hasGainen, hasW1k, hasAll, totalCatScore, avgEnc, encErrors }
  }, [data])

  const handleMouseMove = useCallback(
    (e) => {
      const td = e.target.closest('td[data-num]')
      if (!td) {
        setTooltip(null)
        return
      }
      const d = byNum[td.dataset.num]
      if (!d) {
        setTooltip(null)
        return
      }
      setTooltip({ d, x: e.clientX, y: e.clientY })
    },
    [byNum]
  )

  const handleMouseLeave = useCallback(() => setTooltip(null), [])

  if (!data) return html`<h1 style=${{ color: '#888' }}>Loading...</h1>`

  return html`
    <div>
      <h1>999 Words Dashboard</h1>
      <p className="subtitle">000–999 辞書エントリの完成度・スコア可視化</p>

      <${SummaryCards} stats=${stats} />

      <h2>Completion Progress</h2>
      <${ProgressBars} stats=${stats} />

      <h2>XY(row) × Z(col) Heatmap</h2>
      <p className="subtitle">各3桁数字のステータスをヒートマップ表示</p>
      <${ModeSwitcher} mode=${mode} onChange=${setMode} />
      <${Legend} items=${LEGENDS[mode]} />
      <${MainHeatmap} byNum=${byNum} mode=${mode}
        onMouseMove=${handleMouseMove} onMouseLeave=${handleMouseLeave} />

      <h2>2桁 Summary (10個まとめ)</h2>
      <p className="subtitle">2桁ごとに10個を集約した10×10ヒートマップ</p>
      <${ModeSwitcher} mode=${mode} onChange=${setMode} prefix="smode" />
      <${SumModeSwitcher} sumMode=${sumMode} onChange=${setSumMode} />
      <${Legend} items=${SUMMARY_LEGENDS[mode]} />
      <${SummaryHeatmapTable} byNum=${byNum} mode=${mode} sumMode=${sumMode} />

      <h2>Rule Usage (w1k 採用済み)</h2>
      <p className="subtitle">各数字の採用済み w1k エンコードにおけるルール使用率</p>
      <${RuleCharts} ruleStats=${ruleStats} />

      <h2>Kana Usage (w1k)</h2>
      <p className="subtitle">w1k エンコードで使用されている各かなの出現回数</p>
      <${KanaUsage} ruleStats=${ruleStats} />

      ${tooltip && html`<${Tooltip} d=${tooltip.d} x=${tooltip.x} y=${tooltip.y} />`}
    </div>
  `
}

// ─── Mount ──────────────────────────────────────────────

ReactDOM.createRoot(document.getElementById('root')).render(html`<${App} />`)
