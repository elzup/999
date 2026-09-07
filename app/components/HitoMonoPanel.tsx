import { useEffect, useMemo, useRef, useState } from 'preact/hooks'
import type VizzuChart from 'vizzu'
import type { Anim, Config, Styles } from 'vizzu'
import wasmUrl from 'vizzu/cvizzu.wasm?url'
import type { NumberEntry } from '../data/schema'
import type { Mode } from '../lib/hitoMono'
import {
  CATS,
  CAT_COLOR,
  CAT_LABEL,
  MIX_COLOR,
  MIX_KINDS,
  MIX_LABEL,
  buildHitoMono,
  ratioOf,
  toVizzuSeries,
} from '../lib/hitoMono'

type View = 'pie' | 'cube' | 'square'

const VIEWS: { id: View; label: string; note: string }[] = [
  { id: 'pie', label: '円', note: '人 / モノ / 概念 の候補数の割合' },
  {
    id: 'cube',
    label: 'キューブ',
    note: '10×10×10。横 = 百の位 × 一の位、縦 = 十の位',
  },
  { id: 'square', label: '平方', note: '√1000 の 32×32。左上 000 → 右下 999' },
]

const MEASURE: Record<Mode, string> = {
  main: '件数(メイン)',
  all: '件数(全候補)',
}
const MIX_SERIES: Record<Mode, string> = {
  main: '構成(メイン)',
  all: '構成(全候補)',
}

const s = (name: string) => ({ name })

const TRANSPARENT = '#00000000'
const AXIS_INK = '#8b8f9a'

// wasm は node_modules から Vite が出す実体を明示的に指す
// (依存の事前バンドルで相対解決が壊れるのを避ける)。
let vizzuLoad: Promise<typeof VizzuChart> | null = null
function loadVizzu() {
  if (!vizzuLoad) {
    vizzuLoad = import('vizzu').then((mod) => {
      mod.default.options({ wasmUrl })
      return mod.default
    })
  }
  return vizzuLoad
}

const hiddenAxis = {
  axis: false as const,
  ticks: false as const,
  guides: false as const,
  interlacing: false as const,
  markerGuides: false as const,
}

function configFor(view: View, mode: Mode): Config.Chart {
  const base = {
    title: null,
    // 凡例は HTML 側 (件数付きの表) が担う。チャートは面積を全部使う。
    legend: null,
    geometry: 'rectangle' as const,
    channels: {
      size: { set: null },
      lightness: { set: null },
      noop: { set: null },
    },
  }

  if (view === 'pie') {
    return {
      ...base,
      coordSystem: 'polar' as const,
      channels: {
        ...base.channels,
        x: {
          set: [s(MEASURE[mode]), s('種別')],
          labels: false,
          ...hiddenAxis,
        },
        y: { set: null, labels: false, ...hiddenAxis },
        color: { set: [s('種別')] },
        label: { set: [s(MEASURE[mode]), s('種別')] },
      },
    }
  }

  const color = { set: [s(MIX_SERIES[mode])] }
  // 番号は (百,十,一) / (列,行) から一意に決まるのでマーカーは増えない。
  // noop に載せるとツールチップに番号が出る。
  const noop = { set: [s('番号')] }
  if (view === 'cube') {
    return {
      ...base,
      coordSystem: 'cartesian' as const,
      channels: {
        ...base.channels,
        x: {
          set: [s('百'), s('一')],
          labels: true,
          labelLevel: 0,
          ...hiddenAxis,
        },
        noop,
        y: {
          set: [s('十')],
          reverse: true,
          labels: true,
          labelLevel: 0,
          ...hiddenAxis,
        },
        color,
        label: { set: null },
      },
    }
  }

  return {
    ...base,
    coordSystem: 'cartesian' as const,
    channels: {
      ...base.channels,
      x: { set: [s('列')], labels: false, ...hiddenAxis },
      y: { set: [s('行')], reverse: true, labels: false, ...hiddenAxis },
      noop,
      color,
      label: { set: null },
    },
  }
}

function styleFor(view: View): Styles.Chart {
  const axis: Styles.Axis = {
    color: TRANSPARENT,
    title: { color: TRANSPARENT },
    label: { color: AXIS_INK, fontSize: 9 },
    ticks: { color: TRANSPARENT },
    interlacing: { color: TRANSPARENT },
  }
  return {
    fontFamily: "-apple-system, 'Helvetica Neue', sans-serif",
    backgroundColor: TRANSPARENT,
    paddingTop: 4,
    plot: {
      areaColor: TRANSPARENT,
      marker: {
        colorPalette:
          view === 'pie'
            ? CATS.map((c) => CAT_COLOR[c]).join(' ')
            : MIX_KINDS.map((k) => MIX_COLOR[k]).join(' '),
        // セル同士を地の色で 2px 相当に切り離す (隣接色が溶けないように)。
        rectangleSpacing: view === 'pie' ? 0 : 0.08,
        borderWidth: 0,
        label: {
          // 既定は塗り色から自動生成した白。地の濃い色に対して十分でないので
          // 濃いインクに固定する。
          filter: 'color(#12141c)' as const,
          fontSize: 11,
          format: 'dimensionsFirst' as const,
          numberFormat: 'none' as const,
        },
      },
      xAxis: axis,
      yAxis: axis,
    },
    logo: { width: 0 },
  }
}

type Props = {
  numbers: NumberEntry[]
}

function HitoMonoPanel({ numbers }: Props) {
  const [mode, setMode] = useState<Mode>('main')
  const [view, setView] = useState<View>('square')
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')

  const elRef = useRef<HTMLDivElement | null>(null)
  const chartRef = useRef<VizzuChart | null>(null)
  const seededRef = useRef(false)

  const stats = useMemo(() => buildHitoMono(numbers), [numbers])
  const series = useMemo(() => toVizzuSeries(stats), [stats])

  const totals = stats.totals[mode]
  const ratio = ratioOf(totals)
  const grand = CATS.reduce((s, c) => s + totals[c], 0)
  const mixCounts = stats.mixCounts[mode]

  useEffect(() => {
    let disposed = false
    loadVizzu()
      .then((Vizzu) => {
        if (disposed || !elRef.current) return null
        const chart = new Vizzu({ element: elRef.current })
        chartRef.current = chart
        return chart.initializing
      })
      .then((chart) => {
        if (disposed || !chart) return
        chart.feature('tooltip', true)
        setStatus('ready')
      })
      .catch(() => {
        if (!disposed) setStatus('error')
      })

    return () => {
      disposed = true
      seededRef.current = false
      try {
        chartRef.current?.detach()
      } catch {
        // 初期化前の破棄は無視 (wasm 未ロードのまま画面を離れた場合)
      }
      chartRef.current = null
    }
  }, [])

  useEffect(() => {
    const chart = chartRef.current
    if (status !== 'ready' || !chart) return
    // Vizzu のデータは追記のみなので、系列を積むのは最初の 1 回だけ。
    const target: Anim.Target = {
      ...(seededRef.current ? {} : { data: { series } }),
      config: configFor(view, mode),
      style: styleFor(view),
    }
    seededRef.current = true
    chart
      .animate([{ target, options: { duration: '0.6s' } }])
      .catch(() => setStatus('error'))
  }, [status, view, mode, series])

  const activeView = VIEWS.find((v) => v.id === view)!

  return (
    <div class="content hm-panel">
      <div class="hm-ctrls">
        <div class="hm-switch" role="group" aria-label="集計対象">
          {(['main', 'all'] as Mode[]).map((m) => (
            <button
              key={m}
              class={'hm-btn' + (m === mode ? ' active' : '')}
              aria-pressed={m === mode}
              onClick={() => setMode(m)}
            >
              {m === 'main' ? 'メインのみ' : '全候補'}
            </button>
          ))}
        </div>
        <div class="hm-switch" role="group" aria-label="表示">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              class={'hm-btn' + (v.id === view ? ' active' : '')}
              aria-pressed={v.id === view}
              onClick={() => setView(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>
      </div>

      <div class="hm-note">{activeView.note}</div>

      <div class={`hm-chart-wrap hm-${view}`}>
        <div class="hm-chart" ref={elRef} />
        {status !== 'ready' && (
          <div class="hm-overlay">
            {status === 'loading'
              ? 'wasm 読み込み中…'
              : 'グラフを読み込めませんでした'}
          </div>
        )}
      </div>

      <table class="hm-table">
        <thead>
          <tr>
            <th scope="col">種別</th>
            <th scope="col">候補数</th>
            <th scope="col">割合</th>
          </tr>
        </thead>
        <tbody>
          {CATS.map((c) => (
            <tr key={c}>
              <th scope="row">
                <span class="hm-chip" style={{ background: CAT_COLOR[c] }} />
                {CAT_LABEL[c]}
              </th>
              <td>{totals[c]}</td>
              <td>{ratio[c].toFixed(1)}%</td>
            </tr>
          ))}
          <tr class="hm-total">
            <th scope="row">合計</th>
            <td>{grand}</td>
            <td>100.0%</td>
          </tr>
        </tbody>
      </table>

      {view !== 'pie' && (
        <div class="hm-legend">
          <div class="hm-legend-title">1000 セルの構成</div>
          <ul>
            {MIX_KINDS.map((k) => (
              <li key={k}>
                <span class="hm-chip" style={{ background: MIX_COLOR[k] }} />
                <span class="hm-legend-label">{MIX_LABEL[k]}</span>
                <span class="hm-legend-count">{mixCounts[k]}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div class="hm-credit">描画: Vizzu (WebAssembly)</div>
    </div>
  )
}

export default HitoMonoPanel
