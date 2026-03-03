;(async () => {
  const params = new URLSearchParams(location.search)
  const dataFile = params.get('data') || './visualize-words.data.json'

  const res = await fetch(dataFile)
  if (!res.ok) {
    document.body.innerHTML =
      '<h1 style="color:#f87171">Failed to load ' + dataFile + '</h1>'
    return
  }

  const { data: DATA, ruleStats: RULE_STATS } = await res.json()

  // Index by num
  const byNum = {}
  for (const d of DATA) byNum[d.num] = d

  // --- Helpers ---
  function compCount(d) {
    let n = 0
    if (d.hito) n++
    if (d.mono) n++
    if (d.gainen) n++
    if (d.w1k) n++
    return n
  }

  // --- Summary ---
  const summaryEl = document.getElementById('summary')
  const total = DATA.length
  const hasHito = DATA.filter((d) => d.hito).length
  const hasMono = DATA.filter((d) => d.mono).length
  const hasGainen = DATA.filter((d) => d.gainen).length
  const hasW1k = DATA.filter((d) => d.w1k).length
  const hasAll = DATA.filter(
    (d) => d.hito && d.mono && d.gainen && d.w1k
  ).length

  const totalCatScore = DATA.reduce((s, d) => s + d.catScore, 0)
  const validScores = DATA.filter((d) => d.w1Score !== null && !d.w1Error)
  const avgEnc =
    validScores.length > 0
      ? (
          validScores.reduce((s, d) => s + d.w1Score, 0) / validScores.length
        ).toFixed(1)
      : '-'
  const encErrors = DATA.filter((d) => d.w1Error).length

  const cards = [
    { label: 'Total', value: total, cls: '' },
    {
      label: '人',
      value: hasHito,
      sub: ((hasHito / total) * 100).toFixed(1) + '%',
      cls: 'blue',
    },
    {
      label: '物',
      value: hasMono,
      sub: ((hasMono / total) * 100).toFixed(1) + '%',
      cls: 'green',
    },
    {
      label: '概念',
      value: hasGainen,
      sub: ((hasGainen / total) * 100).toFixed(1) + '%',
      cls: 'yellow',
    },
    {
      label: 'w1k',
      value: hasW1k,
      sub: ((hasW1k / total) * 100).toFixed(1) + '%',
      cls: 'green',
    },
    {
      label: 'All filled',
      value: hasAll,
      sub: ((hasAll / total) * 100).toFixed(1) + '%',
      cls: 'green',
    },
    { label: 'Cat Score', value: totalCatScore, cls: 'yellow' },
    { label: 'Enc Avg', value: avgEnc, cls: 'green' },
    {
      label: 'Enc Errors',
      value: encErrors,
      cls: encErrors > 0 ? 'red' : 'green',
    },
  ]

  summaryEl.innerHTML = cards
    .map(
      (c) =>
        `<div class="summary-card">
    <div class="label">${c.label}</div>
    <div class="value ${c.cls}">${c.value}</div>
    ${c.sub ? '<div class="sub">' + c.sub + '</div>' : ''}
  </div>`
    )
    .join('')

  // --- Progress bars ---
  const progressEl = document.getElementById('progress')
  const progItems = [
    { label: '人', count: hasHito, cls: 'hito' },
    { label: '物', count: hasMono, cls: 'mono' },
    { label: '概念', count: hasGainen, cls: 'gainen' },
    { label: 'w1k', count: hasW1k, cls: 'w1k' },
    { label: 'All', count: hasAll, cls: 'all' },
  ]

  progressEl.innerHTML = progItems
    .map((p) => {
      const pct = ((p.count / total) * 100).toFixed(1)
      return `<div class="prog-row">
      <span class="prog-label">${p.label}</span>
      <div class="prog-bar-bg">
        <div class="prog-bar ${p.cls}" style="width:${pct}%">${pct > 8 ? p.count : ''}</div>
      </div>
      <span class="prog-count">${p.count} / ${total}</span>
    </div>`
    })
    .join('')

  // --- Heatmap ---
  const heatmapEl = document.getElementById('heatmap')
  const legendEl = document.getElementById('heatmap-legend')

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
      if (!d.w1k) return 'enc-none'
      if (d.w1Error) return 'enc-err'
      const s = d.w1Score
      if (s < 20) return 'enc-low'
      if (s < 30) return 'enc-mid'
      if (s < 40) return 'enc-high'
      return 'enc-max'
    },
  }

  const modeLabelMap = {
    completion: (d) => {
      const c = compCount(d)
      return c === 0 ? '' : d.num
    },
    category: (d) => (d.catScore > 0 ? d.num : ''),
    encode: (d) => (d.w1k ? d.num : ''),
  }

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
  }

  let currentMode = 'completion'

  function buildHeatmap() {
    let html = '<tr><th class="corner">YZ\\X</th>'
    for (let z = 0; z <= 9; z++) html += '<th>' + z + '</th>'
    html += '</tr>'

    const resolver = modeClassMap[currentMode]
    const labelFn = modeLabelMap[currentMode]

    for (let x = 0; x <= 9; x++) {
      for (let y = 0; y <= 9; y++) {
        const sep = y === 0 ? ' x-separator' : ''
        const xyLabel = '' + x + y
        html +=
          '<tr><td class="row-header' + sep + '">' + xyLabel + '</td>'
        for (let z = 0; z <= 9; z++) {
          const num = '' + x + y + z
          const d = byNum[num]
          if (!d) {
            html +=
              '<td class="comp-0' + sep + '">' + num + '</td>'
            continue
          }
          const cls = resolver(d)
          const label = labelFn(d)
          html +=
            '<td class="' +
            cls +
            sep +
            '" data-num="' +
            num +
            '">' +
            (label || num) +
            '</td>'
        }
        html += '</tr>'
      }
    }
    heatmapEl.innerHTML = html
  }

  function updateLegend() {
    const items = modeLegends[currentMode]
    legendEl.innerHTML = items
      .map(
        (it) =>
          '<div class="legend-item"><div class="legend-swatch ' +
          it.cls +
          '"></div><span>' +
          it.label +
          '</span></div>'
      )
      .join('')
  }

  buildHeatmap()
  updateLegend()

  // --- Summary 10x10 Heatmap ---
  const summaryHeatmapEl = document.getElementById('summary-heatmap')
  const summaryLegendEl = document.getElementById('summary-heatmap-legend')

  function xyGroup(x, y) {
    const items = []
    for (let z = 0; z <= 9; z++) {
      const num = '' + x + y + z
      const d = byNum[num]
      if (d) items.push(d)
    }
    return items
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
        value: filled,
        label: filled > 0 ? filled + '' : '',
        cls: 'sg-' + Math.min(Math.floor(filled / 2), 5),
      }
    },
    category: (items) => {
      const total = items.reduce((s, d) => s + d.catScore, 0)
      const cls =
        total === 0
          ? 'sg-0'
          : total <= 50
            ? 'sg-1'
            : total <= 100
              ? 'sg-2'
              : total <= 200
                ? 'sg-3'
                : total <= 350
                  ? 'sg-4'
                  : 'sg-5'
      return { value: total, label: total > 0 ? total + '' : '', cls }
    },
    encode: (items) => {
      const scored = items
        .map((d) => bestScore(d))
        .filter((s) => s !== null)
      if (scored.length === 0)
        return { value: 0, label: '', cls: 'sg-0' }
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
      return { value: avg, label: avg.toFixed(0), cls }
    },
  }

  const summaryLegends = {
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

  function buildSummaryHeatmap() {
    const resolver = summaryResolvers[currentMode]
    let html = '<tr><th class="corner">X\\Y</th>'
    for (let y = 0; y <= 9; y++) html += '<th>' + y + '</th>'
    html += '</tr>'

    for (let x = 0; x <= 9; x++) {
      html += '<tr><td class="row-header">' + x + '</td>'
      for (let y = 0; y <= 9; y++) {
        const items = xyGroup(x, y)
        const r = resolver(items)
        const xy = '' + x + y
        html +=
          '<td class="' +
          r.cls +
          '" data-xy="' +
          xy +
          '">' +
          r.label +
          '</td>'
      }
      html += '</tr>'
    }
    summaryHeatmapEl.innerHTML = html
  }

  function updateSummaryLegend() {
    const items = summaryLegends[currentMode]
    summaryLegendEl.innerHTML = items
      .map(
        (it) =>
          '<div class="legend-item"><div class="legend-swatch ' +
          it.cls +
          '"></div><span>' +
          it.label +
          '</span></div>'
      )
      .join('')
  }

  buildSummaryHeatmap()
  updateSummaryLegend()

  document.querySelectorAll('input[name="mode"]').forEach((radio) => {
    radio.addEventListener('change', (e) => {
      currentMode = e.target.value
      buildHeatmap()
      updateLegend()
      buildSummaryHeatmap()
      updateSummaryLegend()
    })
  })

  // --- Tooltip ---
  const tooltip = document.getElementById('tooltip')

  heatmapEl.addEventListener('mousemove', (e) => {
    const td = e.target.closest('td[data-num]')
    if (!td) {
      tooltip.style.display = 'none'
      return
    }

    const num = td.dataset.num
    const d = byNum[num]
    if (!d) {
      tooltip.style.display = 'none'
      return
    }

    let rows = '<div class="tt-num">' + num + '</div>'

    if (d.hito)
      rows +=
        '<div class="tt-row"><span class="tt-label">人: </span><span class="tt-val">' +
        d.hito +
        '</span> <span class="tt-label">(' +
        d.hitoCnt +
        '\u00d78=' +
        d.hitoCnt * 8 +
        ')</span></div>'
    if (d.mono)
      rows +=
        '<div class="tt-row"><span class="tt-label">物: </span><span class="tt-val">' +
        d.mono +
        '</span> <span class="tt-label">(' +
        d.monoCnt +
        '\u00d710=' +
        d.monoCnt * 10 +
        ')</span></div>'
    if (d.gainen)
      rows +=
        '<div class="tt-row"><span class="tt-label">概念: </span><span class="tt-val">' +
        d.gainen +
        '</span> <span class="tt-label">(' +
        d.gainenCnt +
        '\u00d74=' +
        d.gainenCnt * 4 +
        ')</span></div>'
    rows +=
      '<div class="tt-row"><span class="tt-label">Cat Score: </span><span class="tt-score tt-green">' +
      d.catScore +
      '</span></div>'

    if (d.w1) {
      const scoreStr = d.w1Error
        ? '<span class="tt-red">ERROR</span>'
        : d.w1Score !== null
          ? '<span class="tt-green">' + d.w1Score + '</span>'
          : '<span class="tt-gray">-</span>'
      rows +=
        '<div class="tt-row"><span class="tt-label">w1: </span><span class="tt-val">' +
        d.w1 +
        '</span></div>'
      if (d.w1k) {
        rows +=
          '<div class="tt-row"><span class="tt-label">w1k: </span><span class="tt-kana">' +
          d.w1k +
          '</span> \u2192 ' +
          scoreStr
        if (d.w1Pattern)
          rows +=
            ' <span class="tt-label">[' + d.w1Pattern + ']</span>'
        rows += '</div>'
      }
    }
    if (d.w2) {
      const scoreStr = d.w2Error
        ? '<span class="tt-red">ERROR</span>'
        : d.w2Score !== null
          ? '<span class="tt-green">' + d.w2Score + '</span>'
          : '<span class="tt-gray">-</span>'
      rows +=
        '<div class="tt-row"><span class="tt-label">w2: </span><span class="tt-val">' +
        d.w2 +
        '</span></div>'
      if (d.w2k)
        rows +=
          '<div class="tt-row"><span class="tt-label">w2k: </span><span class="tt-kana">' +
          d.w2k +
          '</span> \u2192 ' +
          scoreStr +
          '</div>'
    }

    tooltip.innerHTML = rows
    tooltip.style.display = 'block'
    tooltip.style.left = e.clientX + 16 + 'px'
    tooltip.style.top = e.clientY + 16 + 'px'

    const rect = tooltip.getBoundingClientRect()
    if (rect.right > window.innerWidth)
      tooltip.style.left = e.clientX - rect.width - 8 + 'px'
    if (rect.bottom > window.innerHeight)
      tooltip.style.top = e.clientY - rect.height - 8 + 'px'
  })

  heatmapEl.addEventListener('mouseleave', () => {
    tooltip.style.display = 'none'
  })

  // --- Rule Usage Charts ---
  const patChartEl = document.getElementById('pattern-chart')
  const tokChartEl = document.getElementById('token-chart')
  const scored = RULE_STATS.scoredCount || 1

  const patEntries = Object.entries(RULE_STATS.patterns).sort(
    (a, b) => b[1] - a[1]
  )
  const patMax = patEntries.length > 0 ? patEntries[0][1] : 1
  const patClsMap = {
    'DD+D': 'pat-dd-d',
    'D+DD': 'pat-d-dd',
    'D+D+D': 'pat-d-d-d',
  }

  patChartEl.innerHTML =
    patEntries
      .map(([pat, cnt]) => {
        const pct = ((cnt / scored) * 100).toFixed(1)
        const barW = ((cnt / patMax) * 100).toFixed(1)
        const cls = patClsMap[pat] || 'pat-other'
        return (
          '<div class="rule-row">' +
          '<span class="rule-label">' +
          pat +
          '</span>' +
          '<div class="rule-bar-bg"><div class="rule-bar ' +
          cls +
          '" style="width:' +
          barW +
          '%">' +
          (barW > 15 ? cnt : '') +
          '</div></div>' +
          '<span class="rule-count">' +
          cnt +
          ' (' +
          pct +
          '%)</span>' +
          '</div>'
        )
      })
      .join('') +
    (RULE_STATS.youon4Count > 0
      ? '<div class="rule-row" style="margin-top:8px"><span class="rule-label" style="color:#fbbf24">拗音4省略</span><span class="rule-count">' +
        RULE_STATS.youon4Count +
        ' (' +
        ((RULE_STATS.youon4Count / scored) * 100).toFixed(1) +
        '%)</span></div>'
      : '')

  const tokOrder = [
    { key: 'double', label: 'double (2桁)', cls: 'tok-double' },
    { key: 'core', label: 'single core', cls: 'tok-core' },
    { key: 'sub', label: 'single sub', cls: 'tok-sub' },
    { key: 'bad', label: 'single bad', cls: 'tok-bad' },
    { key: 'sokuon', label: 'sokuon (っ)', cls: 'tok-sokuon' },
    { key: 'halfOverflow', label: 'halfOverflow', cls: 'tok-half' },
    { key: 'overflow', label: 'overflow', cls: 'tok-overflow' },
  ]
  const tokMax = Math.max(
    ...tokOrder.map((t) => RULE_STATS.tokenTypes[t.key] || 0),
    1
  )
  const totalTokens =
    Object.values(RULE_STATS.tokenTypes).reduce((a, b) => a + b, 0) || 1

  tokChartEl.innerHTML = tokOrder
    .map((t) => {
      const cnt = RULE_STATS.tokenTypes[t.key] || 0
      if (cnt === 0) return ''
      const pct = ((cnt / totalTokens) * 100).toFixed(1)
      const barW = ((cnt / tokMax) * 100).toFixed(1)
      return (
        '<div class="rule-row">' +
        '<span class="rule-label">' +
        t.label +
        '</span>' +
        '<div class="rule-bar-bg"><div class="rule-bar ' +
        t.cls +
        '" style="width:' +
        barW +
        '%">' +
        (barW > 15 ? cnt : '') +
        '</div></div>' +
        '<span class="rule-count">' +
        cnt +
        ' (' +
        pct +
        '%)</span>' +
        '</div>'
      )
    })
    .join('')

  // --- Kana Usage ---
  const ku = RULE_STATS.kanaUsage || {}
  const kuVals = Object.values(ku)
  const kuMax = kuVals.length > 0 ? Math.max(...kuVals) : 1

  function kuCls(c) {
    if (!c) return 'ku0'
    const r = c / kuMax
    if (r < 0.05) return 'ku1'
    if (r < 0.15) return 'ku2'
    if (r < 0.35) return 'ku3'
    if (r < 0.65) return 'ku4'
    return 'ku5'
  }

  function kuTd(k) {
    if (!k) return '<td class="ku0"></td>'
    const c = ku[k] || 0
    return (
      '<td class="' +
      kuCls(c) +
      '"><span class="kc">' +
      k +
      '</span><span class="kn">' +
      c +
      '</span></td>'
    )
  }

  function kuGrid(title, cols, rows) {
    let h =
      '<div><h3 style="color:#ccc;font-size:14px;margin:0 0 6px">' +
      title +
      '</h3><table class="kana-grid"><tr><th class="rl"></th>'
    for (let i = 0; i < cols.length; i++) h += '<th>' + cols[i] + '</th>'
    h += '</tr>'
    for (let i = 0; i < rows.length; i++) {
      h += '<tr><td class="rl">' + rows[i].l + '</td>'
      for (let j = 0; j < rows[i].k.length; j++) h += kuTd(rows[i].k[j])
      for (let j = rows[i].k.length; j < cols.length; j++)
        h += '<td class="ku0"></td>'
      h += '</tr>'
    }
    return h + '</table></div>'
  }

  const vowH = ['あ', 'い', 'う', 'え', 'お']
  const seion = [
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
  const dakuon = [
    { l: 'が', k: ['が', 'ぎ', 'ぐ', 'げ', 'ご'] },
    { l: 'ざ', k: ['ざ', 'じ', 'ず', 'ぜ', 'ぞ'] },
    { l: 'だ', k: ['だ', 'ぢ', 'づ', 'で', 'ど'] },
    { l: 'ば', k: ['ば', 'び', 'ぶ', 'べ', 'ぼ'] },
    { l: 'ぱ', k: ['ぱ', 'ぴ', 'ぷ', 'ぺ', 'ぽ'] },
  ]
  const youonH = ['ゃ', 'ゅ', 'ょ']
  const youon = [
    { l: 'き', k: ['きゃ', 'きゅ', 'きょ'] },
    { l: 'し', k: ['しゃ', 'しゅ', 'しょ'] },
    { l: 'ち', k: ['ちゃ', 'ちゅ', 'ちょ'] },
    { l: 'に', k: ['にゃ', 'にゅ', 'にょ'] },
    { l: 'ひ', k: ['ひゃ', 'ひゅ', 'ひょ'] },
    { l: 'み', k: ['みゃ', 'みゅ', 'みょ'] },
    { l: 'り', k: ['りゃ', 'りゅ', 'りょ'] },
    { l: 'じ', k: ['じゃ', 'じゅ', 'じょ'] },
  ]

  const shown = {}
  ;[seion, dakuon, youon].forEach((grp) => {
    grp.forEach((r) => {
      r.k.forEach((k) => {
        if (k) shown[k] = 1
      })
    })
  })
  shown['っ'] = 1

  const others = Object.keys(ku)
    .filter((k) => !shown[k])
    .sort((a, b) => (ku[b] || 0) - (ku[a] || 0))

  const kuEl = document.getElementById('kana-usage')
  let html = '<div class="kana-grids">'
  html += kuGrid('清音', vowH, seion)
  html += kuGrid('濁音・半濁音', vowH, dakuon)
  html += kuGrid('拗音', youonH, youon)
  html += '</div>'

  html += '<div class="kana-grids" style="margin-top:8px">'
  html +=
    '<div><h3 style="color:#ccc;font-size:14px;margin:0 0 6px">促音</h3>'
  html +=
    '<div class="ku-badge ' +
    kuCls(ku['っ'] || 0) +
    '">っ<span class="kn">' +
    (ku['っ'] || 0) +
    '</span></div></div>'

  if (others.length > 0) {
    html +=
      '<div><h3 style="color:#ccc;font-size:14px;margin:0 0 6px">その他</h3>'
    html += '<div class="ku-others">'
    others.forEach((k) => {
      const c = ku[k] || 0
      html +=
        '<div class="ku-chip ' +
        kuCls(c) +
        '"><span class="kc">' +
        k +
        '</span><span class="kn">' +
        c +
        '</span></div>'
    })
    html += '</div></div>'
  }
  html += '</div>'
  kuEl.innerHTML = html
})()
