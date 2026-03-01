import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadWords, categoryScore } from './words.js'
import { score } from './scorer.js'

const srcDir = dirname(fileURLToPath(import.meta.url))

/** トークン種別を短縮記号に変換 */
function tokenLabel(t) {
  const labels = {
    single: 'D',
    double: 'DD',
    sokuon: '\u3063',
    halfOverflow: 'H',
    overflow: 'X',
  }
  return labels[t.type] ?? '?'
}

function buildData(filename = 'words.tsv') {
  const entries = loadWords(filename)

  const patterns = {}
  const tokenTypes = {
    core: 0,
    sub: 0,
    bad: 0,
    double: 0,
    sokuon: 0,
    halfOverflow: 0,
    overflow: 0,
  }
  let youon4Count = 0
  let scoredCount = 0

  const data = entries.map((entry) => {
    const cat = categoryScore(entry)
    const row = {
      num: entry.num,
      hito: entry.hito,
      mono: entry.mono,
      gainen: entry.gainen,
      w1: entry.w1,
      w1k: entry.w1k,
      w2: entry.w2,
      w2k: entry.w2k,
      ...cat,
      w1Score: null,
      w1Error: false,
      w1Pattern: '',
      w2Score: null,
      w2Error: false,
    }

    if (entry.w1k) {
      try {
        const s = score(entry.w1k)
        row.w1Score = s.score
        const pat = s.tokens.map(tokenLabel).join('+')
        row.w1Pattern = pat
        patterns[pat] = (patterns[pat] ?? 0) + 1
        for (const t of s.tokens) {
          if (t.type === 'single') {
            tokenTypes[t.tier ?? 'bad']++
          } else {
            tokenTypes[t.type]++
          }
        }
        if (s.youon4) youon4Count++
        scoredCount++
      } catch {
        row.w1Error = true
      }
    }

    if (entry.w2k) {
      try {
        const s2 = score(entry.w2k)
        row.w2Score = s2.score
      } catch {
        row.w2Error = true
      }
    }

    return row
  })

  const ruleStats = { patterns, tokenTypes, youon4Count, scoredCount }
  return { data, ruleStats }
}

function buildHtml(data, ruleStats) {
  const dataJson = JSON.stringify(data)
  const ruleStatsJson = JSON.stringify(ruleStats)

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>999 Words Visualization</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: 'Helvetica Neue', Arial, sans-serif;
    background: #0f1117;
    color: #e0e0e0;
    padding: 24px;
  }
  h1 { font-size: 24px; margin-bottom: 8px; color: #fff; }
  h2 { font-size: 18px; margin: 24px 0 12px; color: #ccc; }
  .subtitle { color: #888; font-size: 14px; margin-bottom: 24px; }

  /* Summary cards */
  .summary {
    display: flex; flex-wrap: wrap; gap: 12px; margin-bottom: 24px;
  }
  .summary-card {
    background: #1a1d27; border-radius: 8px; padding: 12px 18px;
    min-width: 120px;
  }
  .summary-card .label { font-size: 11px; color: #888; margin-bottom: 4px; }
  .summary-card .value { font-size: 22px; font-weight: bold; color: #fff; }
  .summary-card .sub { font-size: 12px; color: #888; margin-top: 2px; }
  .value.green { color: #4ade80; }
  .value.yellow { color: #fbbf24; }
  .value.red { color: #f87171; }
  .value.blue { color: #7dd3fc; }

  /* Mode switcher */
  .mode-switcher {
    display: flex; gap: 0; margin: 12px 0; border-radius: 6px; overflow: hidden;
    border: 1px solid #2a2d37; width: fit-content;
  }
  .mode-switcher label {
    padding: 6px 16px; font-size: 13px; cursor: pointer;
    background: #1a1d27; color: #888; transition: all 0.15s;
    border-right: 1px solid #2a2d37; user-select: none;
  }
  .mode-switcher label:last-child { border-right: none; }
  .mode-switcher input { display: none; }
  .mode-switcher input:checked + label {
    background: #2a2d37; color: #fff; font-weight: bold;
  }

  /* Legend */
  .legend {
    display: flex; gap: 16px; flex-wrap: wrap;
    margin: 12px 0; font-size: 13px;
  }
  .legend-item { display: flex; align-items: center; gap: 6px; }
  .legend-swatch {
    width: 18px; height: 18px; border-radius: 3px; border: 1px solid #333;
  }

  /* Heatmap */
  .heatmap-wrap { overflow-x: auto; }
  .heatmap { border-collapse: collapse; }
  .heatmap th {
    width: 40px; height: 28px; text-align: center; font-size: 11px;
    border: 1px solid #2a2d37; background: #1a1d27; color: #888;
    position: sticky; top: 0; z-index: 2;
  }
  .heatmap .corner { position: sticky; left: 0; z-index: 3; }
  .heatmap .row-header {
    background: #1a1d27; color: #888; font-weight: bold; font-size: 11px;
    width: 36px; min-width: 36px; text-align: center;
    position: sticky; left: 0; z-index: 1;
    border: 1px solid #2a2d37;
  }
  .heatmap .x-separator { border-top: 2px solid #444; }
  .heatmap td {
    width: 40px; height: 28px; text-align: center; font-size: 10px;
    border: 1px solid #1a1d27; cursor: default; position: relative;
  }

  /* Completion colors */
  .comp-0 { background: #1a1d22; color: #333; }
  .comp-1 { background: #1a2218; color: #6b8a5e; }
  .comp-2 { background: #1f2e1a; color: #8ab87a; }
  .comp-3 { background: #243d1e; color: #a3d694; }
  .comp-4 { background: #1e5c2e; color: #4ade80; font-weight: bold; }

  /* Category score colors */
  .cat-0 { background: #1a1d22; color: #333; }
  .cat-1 { background: #1a2218; color: #6ee7b7; }
  .cat-2 { background: #1e3420; color: #86efac; }
  .cat-3 { background: #224a26; color: #a7f3d0; }
  .cat-4 { background: #26602e; color: #bbf7d0; }
  .cat-5 { background: #2d7a3e; color: #dcfce7; font-weight: bold; }

  /* Encode score colors */
  .enc-none { background: #1a1d22; color: #333; }
  .enc-err { background: #450a0a; color: #f87171; }
  .enc-low { background: #78350f; color: #fbbf24; }
  .enc-mid { background: #1e3a2f; color: #6ee7b7; }
  .enc-high { background: #166534; color: #4ade80; font-weight: bold; }
  .enc-max { background: #15803d; color: #dcfce7; font-weight: bold; }

  /* Fields completion colors */
  .fld-none { background: #1a1d22; color: #333; }
  .fld-hito { background: #1e3a5e; color: #7dd3fc; }
  .fld-mono { background: #1e3a2f; color: #6ee7b7; }
  .fld-gainen { background: #2d1e3a; color: #c4b5fd; }
  .fld-w1k { background: #3a2d1e; color: #fbbf24; }

  /* Tooltip */
  .tooltip {
    display: none; position: fixed; background: #1a1d27; color: #e0e0e0;
    border: 1px solid #444; border-radius: 6px; padding: 10px 14px;
    font-size: 13px; z-index: 100; pointer-events: none;
    box-shadow: 0 4px 12px rgba(0,0,0,0.5); max-width: 360px;
  }
  .tooltip .tt-num { font-size: 18px; font-weight: bold; color: #fff; margin-bottom: 4px; }
  .tooltip .tt-row { margin: 2px 0; }
  .tooltip .tt-label { color: #888; }
  .tooltip .tt-val { color: #e0e0e0; }
  .tooltip .tt-kana { color: #fbbf24; }
  .tooltip .tt-score { font-weight: bold; }
  .tooltip .tt-green { color: #4ade80; }
  .tooltip .tt-red { color: #f87171; }
  .tooltip .tt-gray { color: #555; }

  /* Progress bars */
  .progress-section { margin: 24px 0; }
  .prog-row { display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 13px; }
  .prog-label { width: 60px; text-align: right; color: #888; font-weight: bold; }
  .prog-bar-bg { flex: 1; max-width: 400px; height: 22px; background: #15171e; border-radius: 4px; overflow: hidden; }
  .prog-bar { height: 100%; border-radius: 4px; display: flex; align-items: center; padding-left: 8px; font-size: 11px; font-weight: bold; }
  .prog-bar.hito { background: #1e3a5e; color: #7dd3fc; }
  .prog-bar.mono { background: #1e3a2f; color: #6ee7b7; }
  .prog-bar.gainen { background: #2d1e3a; color: #c4b5fd; }
  .prog-bar.w1k { background: #3a2d1e; color: #fbbf24; }
  .prog-bar.all { background: #166534; color: #4ade80; }
  .prog-count { color: #888; font-size: 12px; width: 80px; }

  /* Rule usage */
  .rule-section { margin: 32px 0; }
  .rule-row {
    display: flex; align-items: center; gap: 8px; margin: 4px 0; font-size: 13px;
  }
  .rule-label {
    width: 100px; text-align: right; color: #ccc; font-family: monospace;
    font-weight: bold; font-size: 13px;
  }
  .rule-bar-bg {
    flex: 1; max-width: 400px; height: 24px; background: #15171e;
    border-radius: 4px; overflow: hidden;
  }
  .rule-bar {
    height: 100%; border-radius: 4px; display: flex; align-items: center;
    padding-left: 8px; font-size: 11px; font-weight: bold; min-width: 2px;
  }
  .rule-bar.pat-dd-d { background: #1e3a5e; color: #7dd3fc; }
  .rule-bar.pat-d-dd { background: #1e3a2f; color: #6ee7b7; }
  .rule-bar.pat-d-d-d { background: #2d1e3a; color: #c4b5fd; }
  .rule-bar.pat-other { background: #3a2d1e; color: #fbbf24; }
  .rule-bar.tok-core { background: #166534; color: #4ade80; }
  .rule-bar.tok-sub { background: #854d0e; color: #fbbf24; }
  .rule-bar.tok-bad { background: #7f1d1d; color: #f87171; }
  .rule-bar.tok-double { background: #1e3a5e; color: #7dd3fc; }
  .rule-bar.tok-sokuon { background: #5b21b6; color: #c4b5fd; }
  .rule-bar.tok-half { background: #78350f; color: #fbbf24; }
  .rule-bar.tok-overflow { background: #450a0a; color: #f87171; }
  .rule-count { color: #888; font-size: 12px; width: 100px; }
  .rule-columns { display: flex; gap: 48px; flex-wrap: wrap; align-items: flex-start; }
  .rule-col { flex: 1; min-width: 300px; }
</style>
</head>
<body>

<h1>999 Words Dashboard</h1>
<p class="subtitle">000\u2013999 辞書エントリの完成度・スコア可視化</p>

<div class="summary" id="summary"></div>

<h2>Completion Progress</h2>
<div class="progress-section" id="progress"></div>

<h2>XY(row) \xd7 Z(col) Heatmap</h2>
<p class="subtitle">各3桁数字のステータスをヒートマップ表示</p>

<div class="mode-switcher">
  <input type="radio" name="mode" id="mode-comp" value="completion" checked>
  <label for="mode-comp">Completion</label>
  <input type="radio" name="mode" id="mode-cat" value="category">
  <label for="mode-cat">Category Score</label>
  <input type="radio" name="mode" id="mode-enc" value="encode">
  <label for="mode-enc">Encode Score</label>
</div>

<div class="legend" id="heatmap-legend"></div>
<div class="heatmap-wrap"><table class="heatmap" id="heatmap"></table></div>

<h2>Rule Usage (w1k \u63a1\u7528\u6e08\u307f)</h2>
<p class="subtitle">\u5404\u6570\u5b57\u306e\u63a1\u7528\u6e08\u307f w1k \u30a8\u30f3\u30b3\u30fc\u30c9\u306b\u304a\u3051\u308b\u30eb\u30fc\u30eb\u4f7f\u7528\u7387</p>
<div class="rule-columns">
  <div class="rule-col">
    <h2>Pattern Distribution</h2>
    <p class="subtitle">\u5206\u89e3\u30d1\u30bf\u30fc\u30f3\u5225\u30a8\u30f3\u30c8\u30ea\u6570</p>
    <div class="rule-section" id="pattern-chart"></div>
  </div>
  <div class="rule-col">
    <h2>Token Type Distribution</h2>
    <p class="subtitle">\u30c8\u30fc\u30af\u30f3\u7a2e\u5225\u306e\u51fa\u73fe\u56de\u6570</p>
    <div class="rule-section" id="token-chart"></div>
  </div>
</div>

<div class="tooltip" id="tooltip"></div>

<script>
const DATA = ${dataJson};
const RULE_STATS = ${ruleStatsJson};

// Index by num
const byNum = {};
for (const d of DATA) byNum[d.num] = d;

// --- Helpers ---
function compCount(d) {
  let n = 0;
  if (d.hito) n++;
  if (d.mono) n++;
  if (d.gainen) n++;
  if (d.w1k) n++;
  return n;
}

// --- Summary ---
const summaryEl = document.getElementById('summary');
const total = DATA.length;
const hasHito = DATA.filter(d => d.hito).length;
const hasMono = DATA.filter(d => d.mono).length;
const hasGainen = DATA.filter(d => d.gainen).length;
const hasW1k = DATA.filter(d => d.w1k).length;
const hasW2k = DATA.filter(d => d.w2k).length;
const hasAll = DATA.filter(d => d.hito && d.mono && d.gainen && d.w1k).length;

const totalCatScore = DATA.reduce((s, d) => s + d.catScore, 0);
const validScores = DATA.filter(d => d.w1Score !== null && !d.w1Error);
const avgEnc = validScores.length > 0
  ? (validScores.reduce((s, d) => s + d.w1Score, 0) / validScores.length).toFixed(1)
  : '-';
const encErrors = DATA.filter(d => d.w1Error).length;

const cards = [
  { label: 'Total', value: total, cls: '' },
  { label: '\u4eba', value: hasHito, sub: (hasHito/total*100).toFixed(1) + '%', cls: 'blue' },
  { label: '\u7269', value: hasMono, sub: (hasMono/total*100).toFixed(1) + '%', cls: 'green' },
  { label: '\u6982\u5ff5', value: hasGainen, sub: (hasGainen/total*100).toFixed(1) + '%', cls: 'yellow' },
  { label: 'w1k', value: hasW1k, sub: (hasW1k/total*100).toFixed(1) + '%', cls: 'green' },
  { label: 'All filled', value: hasAll, sub: (hasAll/total*100).toFixed(1) + '%', cls: 'green' },
  { label: 'Cat Score', value: totalCatScore, cls: 'yellow' },
  { label: 'Enc Avg', value: avgEnc, cls: 'green' },
  { label: 'Enc Errors', value: encErrors, cls: encErrors > 0 ? 'red' : 'green' },
];

summaryEl.innerHTML = cards.map(c => \`
  <div class="summary-card">
    <div class="label">\${c.label}</div>
    <div class="value \${c.cls}">\${c.value}</div>
    \${c.sub ? '<div class="sub">' + c.sub + '</div>' : ''}
  </div>
\`).join('');

// --- Progress bars ---
const progressEl = document.getElementById('progress');
const progItems = [
  { label: '\u4eba', count: hasHito, cls: 'hito' },
  { label: '\u7269', count: hasMono, cls: 'mono' },
  { label: '\u6982\u5ff5', count: hasGainen, cls: 'gainen' },
  { label: 'w1k', count: hasW1k, cls: 'w1k' },
  { label: 'All', count: hasAll, cls: 'all' },
];

progressEl.innerHTML = progItems.map(p => {
  const pct = (p.count / total * 100).toFixed(1);
  return \`
    <div class="prog-row">
      <span class="prog-label">\${p.label}</span>
      <div class="prog-bar-bg">
        <div class="prog-bar \${p.cls}" style="width:\${pct}%">\${pct > 8 ? p.count : ''}</div>
      </div>
      <span class="prog-count">\${p.count} / \${total}</span>
    </div>
  \`;
}).join('');

// --- Heatmap ---
const heatmapEl = document.getElementById('heatmap');
const legendEl = document.getElementById('heatmap-legend');

const modeClassMap = {
  completion: (d) => 'comp-' + compCount(d),
  category: (d) => {
    const s = d.catScore;
    if (s === 0) return 'cat-0';
    if (s <= 10) return 'cat-1';
    if (s <= 20) return 'cat-2';
    if (s <= 30) return 'cat-3';
    if (s <= 50) return 'cat-4';
    return 'cat-5';
  },
  encode: (d) => {
    if (!d.w1k) return 'enc-none';
    if (d.w1Error) return 'enc-err';
    const s = d.w1Score;
    if (s < 20) return 'enc-low';
    if (s < 30) return 'enc-mid';
    if (s < 40) return 'enc-high';
    return 'enc-max';
  },
};

const modeLabelMap = {
  completion: (d) => {
    const c = compCount(d);
    return c === 0 ? '' : d.num;
  },
  category: (d) => d.catScore > 0 ? d.num : '',
  encode: (d) => d.w1k ? d.num : '',
};

const modeLegends = {
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
    { cls: 'enc-none', label: 'No w1k' },
  ],
};

let currentMode = 'completion';

function buildHeatmap() {
  let html = '<tr><th class="corner">YZ\\\\X</th>';
  for (let z = 0; z <= 9; z++) html += '<th>' + z + '</th>';
  html += '</tr>';

  const resolver = modeClassMap[currentMode];
  const labelFn = modeLabelMap[currentMode];

  for (let x = 0; x <= 9; x++) {
    for (let y = 0; y <= 9; y++) {
      const sep = y === 0 ? ' x-separator' : '';
      const xyLabel = '' + x + y;
      html += '<tr><td class="row-header' + sep + '">' + xyLabel + '</td>';
      for (let z = 0; z <= 9; z++) {
        const num = '' + x + y + z;
        const d = byNum[num];
        if (!d) {
          html += '<td class="comp-0' + sep + '">' + num + '</td>';
          continue;
        }
        const cls = resolver(d);
        const label = labelFn(d);
        html += '<td class="' + cls + sep + '" data-num="' + num + '">' + (label || num) + '</td>';
      }
      html += '</tr>';
    }
  }
  heatmapEl.innerHTML = html;
}

function updateLegend() {
  const items = modeLegends[currentMode];
  legendEl.innerHTML = items.map(it =>
    '<div class="legend-item"><div class="legend-swatch ' + it.cls + '"></div><span>' + it.label + '</span></div>'
  ).join('');
}

buildHeatmap();
updateLegend();

document.querySelectorAll('input[name="mode"]').forEach(radio => {
  radio.addEventListener('change', (e) => {
    currentMode = e.target.value;
    buildHeatmap();
    updateLegend();
  });
});

// --- Tooltip ---
const tooltip = document.getElementById('tooltip');

heatmapEl.addEventListener('mousemove', (e) => {
  const td = e.target.closest('td[data-num]');
  if (!td) { tooltip.style.display = 'none'; return; }

  const num = td.dataset.num;
  const d = byNum[num];
  if (!d) { tooltip.style.display = 'none'; return; }

  let rows = '<div class="tt-num">' + num + '</div>';

  // Category info
  if (d.hito) rows += '<div class="tt-row"><span class="tt-label">\u4eba: </span><span class="tt-val">' + d.hito + '</span> <span class="tt-label">(' + d.hitoCnt + '\u00d78=' + (d.hitoCnt*8) + ')</span></div>';
  if (d.mono) rows += '<div class="tt-row"><span class="tt-label">\u7269: </span><span class="tt-val">' + d.mono + '</span> <span class="tt-label">(' + d.monoCnt + '\u00d710=' + (d.monoCnt*10) + ')</span></div>';
  if (d.gainen) rows += '<div class="tt-row"><span class="tt-label">\u6982\u5ff5: </span><span class="tt-val">' + d.gainen + '</span> <span class="tt-label">(' + d.gainenCnt + '\u00d74=' + (d.gainenCnt*4) + ')</span></div>';
  rows += '<div class="tt-row"><span class="tt-label">Cat Score: </span><span class="tt-score tt-green">' + d.catScore + '</span></div>';

  // Word info
  if (d.w1) {
    const scoreStr = d.w1Error ? '<span class="tt-red">ERROR</span>'
      : d.w1Score !== null ? '<span class="tt-green">' + d.w1Score + '</span>'
      : '<span class="tt-gray">-</span>';
    rows += '<div class="tt-row"><span class="tt-label">w1: </span><span class="tt-val">' + d.w1 + '</span></div>';
    if (d.w1k) {
      rows += '<div class="tt-row"><span class="tt-label">w1k: </span><span class="tt-kana">' + d.w1k + '</span> \u2192 ' + scoreStr;
      if (d.w1Pattern) rows += ' <span class="tt-label">[' + d.w1Pattern + ']</span>';
      rows += '</div>';
    }
  }
  if (d.w2) {
    const scoreStr = d.w2Error ? '<span class="tt-red">ERROR</span>'
      : d.w2Score !== null ? '<span class="tt-green">' + d.w2Score + '</span>'
      : '<span class="tt-gray">-</span>';
    rows += '<div class="tt-row"><span class="tt-label">w2: </span><span class="tt-val">' + d.w2 + '</span></div>';
    if (d.w2k) rows += '<div class="tt-row"><span class="tt-label">w2k: </span><span class="tt-kana">' + d.w2k + '</span> \u2192 ' + scoreStr + '</div>';
  }

  tooltip.innerHTML = rows;
  tooltip.style.display = 'block';
  tooltip.style.left = (e.clientX + 16) + 'px';
  tooltip.style.top = (e.clientY + 16) + 'px';

  const rect = tooltip.getBoundingClientRect();
  if (rect.right > window.innerWidth) tooltip.style.left = (e.clientX - rect.width - 8) + 'px';
  if (rect.bottom > window.innerHeight) tooltip.style.top = (e.clientY - rect.height - 8) + 'px';
});

heatmapEl.addEventListener('mouseleave', () => { tooltip.style.display = 'none'; });

// --- Rule Usage Charts ---
const patChartEl = document.getElementById('pattern-chart');
const tokChartEl = document.getElementById('token-chart');
const scored = RULE_STATS.scoredCount || 1;

// Pattern chart - sorted by count desc
const patEntries = Object.entries(RULE_STATS.patterns).sort((a, b) => b[1] - a[1]);
const patMax = patEntries.length > 0 ? patEntries[0][1] : 1;
const patClsMap = { 'DD+D': 'pat-dd-d', 'D+DD': 'pat-d-dd', 'D+D+D': 'pat-d-d-d' };

patChartEl.innerHTML = patEntries.map(([pat, cnt]) => {
  const pct = (cnt / scored * 100).toFixed(1);
  const barW = (cnt / patMax * 100).toFixed(1);
  const cls = patClsMap[pat] || 'pat-other';
  return '<div class="rule-row">' +
    '<span class="rule-label">' + pat + '</span>' +
    '<div class="rule-bar-bg"><div class="rule-bar ' + cls + '" style="width:' + barW + '%">' + (barW > 15 ? cnt : '') + '</div></div>' +
    '<span class="rule-count">' + cnt + ' (' + pct + '%)</span>' +
    '</div>';
}).join('') + (RULE_STATS.youon4Count > 0
  ? '<div class="rule-row" style="margin-top:8px"><span class="rule-label" style="color:#fbbf24">\u62d7\u97f34\u7701\u7565</span><span class="rule-count">' + RULE_STATS.youon4Count + ' (' + (RULE_STATS.youon4Count / scored * 100).toFixed(1) + '%)</span></div>'
  : '');

// Token type chart
const tokOrder = [
  { key: 'double', label: 'double (2\u6841)', cls: 'tok-double' },
  { key: 'core', label: 'single core', cls: 'tok-core' },
  { key: 'sub', label: 'single sub', cls: 'tok-sub' },
  { key: 'bad', label: 'single bad', cls: 'tok-bad' },
  { key: 'sokuon', label: 'sokuon (\u3063)', cls: 'tok-sokuon' },
  { key: 'halfOverflow', label: 'halfOverflow', cls: 'tok-half' },
  { key: 'overflow', label: 'overflow', cls: 'tok-overflow' },
];
const tokMax = Math.max(...tokOrder.map(t => RULE_STATS.tokenTypes[t.key] || 0), 1);
const totalTokens = Object.values(RULE_STATS.tokenTypes).reduce((a, b) => a + b, 0) || 1;

tokChartEl.innerHTML = tokOrder.map(t => {
  const cnt = RULE_STATS.tokenTypes[t.key] || 0;
  if (cnt === 0) return '';
  const pct = (cnt / totalTokens * 100).toFixed(1);
  const barW = (cnt / tokMax * 100).toFixed(1);
  return '<div class="rule-row">' +
    '<span class="rule-label">' + t.label + '</span>' +
    '<div class="rule-bar-bg"><div class="rule-bar ' + t.cls + '" style="width:' + barW + '%">' + (barW > 15 ? cnt : '') + '</div></div>' +
    '<span class="rule-count">' + cnt + ' (' + pct + '%)</span>' +
    '</div>';
}).join('');
</script>
</body>
</html>`
}

function logStats(label, data) {
  const filled = data.filter((d) => d.w1k).length
  const hasAll = data.filter(
    (d) => d.hito && d.mono && d.gainen && d.w1k
  ).length
  console.log(`${label}: ${data.length} entries  w1k: ${filled}  all: ${hasAll}`)
}

function main() {
  // Real data → gitignored
  const { data, ruleStats } = buildData('words.tsv')
  const outPath = join(srcDir, 'visualize-words.html')
  writeFileSync(outPath, buildHtml(data, ruleStats))
  logStats(outPath, data)

  // Sample data → committed
  const { data: sampleData, ruleStats: sampleRuleStats } =
    buildData('words.tsv.sample')
  const samplePath = join(srcDir, 'visualize-words.sample.html')
  writeFileSync(samplePath, buildHtml(sampleData, sampleRuleStats))
  logStats(samplePath, sampleData)
}

main()
