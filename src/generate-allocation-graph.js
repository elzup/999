import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEntries, analyzeGroups } from './goro-extract.js'
import { extractName, isKanaOnly, toHiragana } from './words.js'

// --- compute distributions ---------------------------------------------------

const entries = loadEntries()

/** 予備語(w1_2/w2_2)はかな化できる語のみ読みにする(漢字は除外) */
function kanaOf(word) {
  const name = extractName(word || '')
  return name && isKanaOnly(name) ? toHiragana(name) : ''
}
const baseSlots = (e) => [e.w1k, e.w2k]
const extSlots = (e) => [e.w1k, e.w2k, kanaOf(e.w1_2), kanaOf(e.w2_2)]

function renderKind(key, kind, vv) {
  if (kind !== 'single') return kind
  const chars = [...key]
  if (vv[0] === vv[1] && chars.length === 2 && chars[0] !== chars[1])
    return 'mix'
  return 'single'
}

function mergeDist(...maps) {
  const out = new Map()
  for (const m of maps) {
    if (!m) continue
    for (const [k, v] of m) {
      const cur = out.get(k) ?? { count: 0, kind: v.kind }
      cur.count += v.count
      out.set(k, cur)
    }
  }
  return out
}

function serialize(distMap, vv) {
  if (!distMap) return []
  return [...distMap.entries()]
    .map(([key, { count, kind }]) => ({
      key,
      kind: renderKind(key, kind, vv),
      count,
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
}

function buildModes(slots) {
  const yz = analyzeGroups(entries, (n) => n.slice(1), slots, [1, 2])
  const xy = analyzeGroups(entries, (n) => n.slice(0, 2), slots, [0, 1])
  const m = { _YZ: {}, XY_: {}, 'XY+YZ': {} }
  for (let v = 0; v < 100; v++) {
    const vv = String(v).padStart(2, '0')
    m['_YZ'][vv] = serialize(yz.get(vv), vv)
    m['XY_'][vv] = serialize(xy.get(vv), vv)
    m['XY+YZ'][vv] = serialize(mergeDist(yz.get(vv), xy.get(vv)), vv)
  }
  return m
}

const DATASETS = { base: buildModes(baseSlots), ext: buildModes(extSlots) }

// --- render HTML -------------------------------------------------------------

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Digit Kana Allocation</title>
<style>
  :root {
    --bg:#0f1117; --surface:#1a1d27; --surface2:#22262f; --border:#2a2d37;
    --text:#e5e7eb; --text2:#8b8f9a;
    --double:#60a5fa; --single:#4ade80; --mix:#fbbf24; --partial:#2dd4bf;
    --fused:#9ca3af; --none:#4b5563; --error:#ef4444;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font-family:system-ui,-apple-system,sans-serif; font-size:13px; }
  header { position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--border);
    padding:12px 16px; z-index:2; }
  h1 { margin:0; font-size:18px; }
  .sub { margin:2px 0 10px; font-size:11px; color:var(--text2); }
  .controls { display:flex; flex-wrap:wrap; align-items:center; gap:12px; }
  .modes, .sort { display:flex; gap:6px; }
  .btn { padding:6px 14px; border:1px solid var(--border); background:var(--surface);
    color:var(--text2); border-radius:6px; cursor:pointer; font-family:ui-monospace,monospace;
    font-size:13px; }
  .btn:hover { color:var(--text); }
  .mode-btn.active { border-color:var(--double); color:var(--double); }
  .sort-btn.active { border-color:var(--single); color:var(--single); }
  .sort-label { font-size:11px; color:var(--text2); }
  .mode-desc { margin-top:6px; font-size:11px; color:var(--text2); font-family:ui-monospace,monospace; }
  .legend { display:flex; flex-wrap:wrap; gap:10px; margin-top:8px; font-size:11px; color:var(--text2); }
  .legend span { display:inline-flex; align-items:center; gap:4px; }
  .sw { width:11px; height:11px; border-radius:2px; display:inline-block; }
  .grid { padding:6px 16px 48px; }
  .row { display:flex; align-items:center; gap:8px; height:26px; border-top:1px solid var(--border); }
  .row:hover { background:rgba(255,255,255,.035); }
  .row:nth-child(10n+1) { border-top:2px solid var(--border); }
  .vv { width:30px; font-family:ui-monospace,monospace; font-weight:700; color:var(--text2);
    flex-shrink:0; }
  .row:nth-child(10n+1) .vv { color:var(--text); }
  .bar { flex:1; display:flex; height:18px; border-radius:3px; overflow-x:auto;
    background:var(--surface); }
  .bar::-webkit-scrollbar { height:4px; }
  .bar::-webkit-scrollbar-thumb { background:var(--border); border-radius:2px; }
  .seg { display:flex; align-items:center; justify-content:center; gap:2px; flex-shrink:0;
    min-width:max-content; padding:0 5px; border-right:1px solid rgba(15,17,23,.25);
    font-family:ui-monospace,monospace; font-size:11px; color:#0f1117; white-space:nowrap; }
  .seg:last-child { border-right:none; }
  .seg .c { font-size:9px; opacity:.6; }
  .grad { display:inline-block; width:60px; height:11px; border-radius:2px; vertical-align:middle;
    margin:0 3px; background:linear-gradient(90deg, hsl(150 60% 22%), hsl(150 60% 68%)); }
  .lsep { margin-left:6px; }
  .total { width:24px; text-align:right; color:var(--text2); font-family:ui-monospace,monospace;
    font-size:11px; flex-shrink:0; }
</style>
</head>
<body>
<header>
  <h1>Digit Kana Allocation</h1>
  <div class="sub">各2桁値 00〜99 の登録語が、その2桁をどのゴロで実現しているかの分布。背景=グループ内シェア(濃淡)、下線=種別</div>
  <div class="controls">
    <div class="modes" id="modes"></div>
    <div class="sort"><span class="sort-label">並び</span><span id="sort"></span></div>
    <div class="sort"><span class="sort-label">枠</span><span id="slots"></span></div>
  </div>
  <div class="mode-desc" id="mode-desc"></div>
  <div class="legend">
    <span>背景=シェア 低<i class="grad"></i>高</span>
    <span class="lsep">下線=種別:</span>
    <span><i class="sw" style="background:var(--double)"></i>2文字</span>
    <span><i class="sw" style="background:var(--single)"></i>単独×2</span>
    <span><i class="sw" style="background:var(--mix)"></i>mix</span>
    <span><i class="sw" style="background:var(--partial)"></i>0省略</span>
    <span><i class="sw" style="background:var(--fused)"></i>融合(と]/[ま/と][ま)</span>
    <span><i class="sw" style="background:var(--none)"></i>未登録</span>
  </div>
</header>
<div class="grid" id="grid"></div>
<script>
const DATASETS = ${JSON.stringify(DATASETS)};
const MODE_KEYS = ['_YZ','XY_','XY+YZ'];
const MODE_DESC = {
  '_YZ':'下2桁として (X可変: 0YZ〜9YZ の語)',
  'XY_':'上2桁として (Z可変: XY0〜XY9 の語)',
  'XY+YZ':'上下2桁を合算 (XY_ ＋ _YZ)',
};
const SLOT_DESC = { base:'w1·w2', ext:'w1·w2 + 予備(w1_2·w2_2)' };
const KIND_COLOR = { double:'#60a5fa', single:'#4ade80', mix:'#fbbf24',
  partial:'#2dd4bf', fused:'#9ca3af', none:'#4b5563', error:'#ef4444' };
let current = '_YZ';
let sortBy = 'count';
let slotSet = 'base';

function sortItems(items) {
  const a = items.slice();
  if (sortBy === 'kana') a.sort((x,y)=> x.key.localeCompare(y.key));
  else a.sort((x,y)=> y.count - x.count || x.key.localeCompare(y.key));
  return a;
}

// 背景 = グループ内シェア(占有率)。高シェアほど明るい緑。
function shareBg(ratio) {
  const L = 20 + ratio * 48;
  return { bg: 'hsl(150 60% ' + L.toFixed(0) + '%)', fg: L > 48 ? '#0f1117' : '#e5e7eb' };
}

function render() {
  const data = DATASETS[slotSet][current];
  document.getElementById('mode-desc').textContent =
    current + ' — ' + MODE_DESC[current] + ' / 枠: ' + SLOT_DESC[slotSet];
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  for (let v = 0; v < 100; v++) {
    const vv = String(v).padStart(2,'0');
    const items = sortItems(data[vv] || []);
    const total = items.reduce((s,i)=>s+i.count,0) || 1;
    const row = document.createElement('div');
    row.className = 'row';
    const segs = items.map(it => {
      const ratio = it.count/total;
      const sc = shareBg(ratio);
      const stripe = KIND_COLOR[it.kind] || KIND_COLOR.none;
      return '<span class="seg" style="flex-grow:'+it.count+';background:'+sc.bg+
        ';color:'+sc.fg+';box-shadow:inset 0 -3px 0 '+stripe+'" title="'+it.key+'='+it.count+
        ' ('+it.kind+', '+Math.round(ratio*100)+'%)">'+it.key+
        '<span class="c">'+it.count+'</span></span>';
    }).join('');
    row.innerHTML = '<span class="vv">'+vv+'</span><div class="bar">'+segs+
      '</div><span class="total">'+total+'</span>';
    grid.appendChild(row);
  }
}

function buildButtons(containerId, keys, labelFn, getActive, onPick, cls) {
  const c = document.getElementById(containerId);
  c.innerHTML = '';
  keys.forEach(k => {
    const b = document.createElement('button');
    b.className = 'btn ' + cls + (getActive()===k?' active':'');
    b.textContent = labelFn(k);
    b.onclick = () => { onPick(k); renderAll(); };
    c.appendChild(b);
  });
}

function renderAll() {
  buildButtons('modes', MODE_KEYS, k=>k, ()=>current, k=>current=k, 'mode-btn');
  buildButtons('sort', ['count','kana'], k=>k, ()=>sortBy, k=>sortBy=k, 'sort-btn');
  buildButtons('slots', ['base','ext'], k=>k==='base'?'標準':'+予備',
    ()=>slotSet, k=>slotSet=k, 'sort-btn');
  render();
}
renderAll();
</script>
</body>
</html>
`

const outPath = join(
  dirname(fileURLToPath(import.meta.url)),
  '..',
  'public',
  'digit-kana-allocation.html'
)
writeFileSync(outPath, html)
console.log(`wrote ${outPath}`)
