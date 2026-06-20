import { writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { loadEntries, analyzeGroups } from './goro-extract.js'

// --- compute the three modes -------------------------------------------------

const entries = loadEntries()
const slots = (e) => [e.w1k, e.w2k] // w1/w2 両方を対象（最大20語）
const yz = analyzeGroups(entries, (n) => n.slice(1), slots, [1, 2]) // _YZ (vary X)
const xy = analyzeGroups(entries, (n) => n.slice(0, 2), slots, [0, 1]) // XY_ (vary Z)

/** single 読みのうち、同じ数字を別かなで表すもの（mix）を判定して種別を確定 */
function renderKind(key, kind, vv) {
  if (kind !== 'single') return kind
  const chars = [...key]
  if (vv[0] === vv[1] && chars.length === 2 && chars[0] !== chars[1]) {
    return 'mix'
  }
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

const modes = { _YZ: {}, XY_: {}, 'XY+YZ': {} }
for (let v = 0; v < 100; v++) {
  const vv = String(v).padStart(2, '0')
  modes['_YZ'][vv] = serialize(yz.get(vv), vv)
  modes['XY_'][vv] = serialize(xy.get(vv), vv)
  modes['XY+YZ'][vv] = serialize(mergeDist(yz.get(vv), xy.get(vv)), vv)
}

// --- render HTML -------------------------------------------------------------

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Digit Kana Allocation</title>
<style>
  :root {
    --bg:#0f1117; --surface:#1a1d27; --border:#2a2d37; --text:#e5e7eb; --text2:#8b8f9a;
    --double:#60a5fa; --single:#4ade80; --mix:#fbbf24; --partial:#2dd4bf;
    --fused:#9ca3af; --none:#4b5563; --error:#ef4444;
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--text);
    font-family:system-ui,-apple-system,sans-serif; font-size:13px; }
  header { position:sticky; top:0; background:var(--bg); border-bottom:1px solid var(--border);
    padding:12px 16px; z-index:2; }
  h1 { margin:0 0 8px; font-size:18px; }
  .modes { display:flex; gap:6px; }
  .mode-btn { padding:6px 14px; border:1px solid var(--border); background:var(--surface);
    color:var(--text2); border-radius:6px; cursor:pointer; font-family:ui-monospace,monospace;
    font-size:13px; }
  .mode-btn.active { border-color:var(--double); color:var(--double); }
  .legend { display:flex; flex-wrap:wrap; gap:10px; margin-top:8px; font-size:11px; color:var(--text2); }
  .legend span { display:inline-flex; align-items:center; gap:4px; }
  .sw { width:11px; height:11px; border-radius:2px; display:inline-block; }
  .grid { padding:8px 16px 40px; }
  .row { display:flex; align-items:center; gap:8px; height:26px; border-top:1px solid var(--border); }
  .row:nth-child(10n+1) { border-top:2px solid var(--border); }
  .vv { width:30px; font-family:ui-monospace,monospace; font-weight:700; color:var(--text2); }
  .bar { flex:1; display:flex; height:18px; border-radius:3px; overflow-x:auto;
    background:var(--surface); }
  .bar::-webkit-scrollbar { height:4px; }
  .seg { display:flex; align-items:center; justify-content:center; gap:2px; flex-shrink:0;
    min-width:max-content; padding:0 4px; border-right:1px solid rgba(15,17,23,.25);
    font-family:ui-monospace,monospace; font-size:11px; color:#0f1117; white-space:nowrap; }
  .seg .c { font-size:9px; opacity:.65; }
  .seg.kind-none, .seg.kind-fused { color:var(--text); }
  .total { width:26px; text-align:right; color:var(--text2); font-family:ui-monospace,monospace; font-size:11px; }
</style>
</head>
<body>
<header>
  <h1>Digit Kana Allocation</h1>
  <div class="modes" id="modes"></div>
  <div class="legend">
    <span><i class="sw" style="background:var(--double)"></i>2文字(double)</span>
    <span><i class="sw" style="background:var(--single)"></i>単独×2(clean)</span>
    <span><i class="sw" style="background:var(--mix)"></i>mix(同数字別読み)</span>
    <span><i class="sw" style="background:var(--partial)"></i>先頭0省略</span>
    <span><i class="sw" style="background:var(--fused)"></i>融合</span>
    <span><i class="sw" style="background:var(--none)"></i>未登録</span>
  </div>
</header>
<div class="grid" id="grid"></div>
<script>
const MODES = ${JSON.stringify(modes)};
const MODE_KEYS = ['_YZ','XY_','XY+YZ'];
const COLOR = { double:'var(--double)', single:'var(--single)', mix:'var(--mix)',
  partial:'var(--partial)', fused:'var(--fused)', none:'var(--none)', error:'var(--error)' };
let current = '_YZ';

function render() {
  const data = MODES[current];
  const grid = document.getElementById('grid');
  grid.innerHTML = '';
  for (let v = 0; v < 100; v++) {
    const vv = String(v).padStart(2,'0');
    const items = data[vv] || [];
    const total = items.reduce((s,i)=>s+i.count,0) || 1;
    const row = document.createElement('div');
    row.className = 'row';
    const segs = items.map(it => {
      return '<span class="seg kind-'+it.kind+'" style="flex-grow:'+it.count+
        ';background:'+(COLOR[it.kind]||'var(--none)')+'" title="'+it.key+'='+it.count+
        ' ('+it.kind+')">'+it.key+'<span class="c">'+it.count+'</span></span>';
    }).join('');
    row.innerHTML = '<span class="vv">'+vv+'</span><div class="bar">'+segs+
      '</div><span class="total">'+items.reduce((s,i)=>s+i.count,0)+'</span>';
    grid.appendChild(row);
  }
}

function buildModes() {
  const c = document.getElementById('modes');
  c.innerHTML = '';
  MODE_KEYS.forEach(k => {
    const b = document.createElement('button');
    b.className = 'mode-btn' + (k===current?' active':'');
    b.textContent = k;
    b.onclick = () => { current = k; buildModes(); render(); };
    c.appendChild(b);
  });
}
buildModes();
render();
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
