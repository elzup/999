import { useState, useCallback } from 'preact/hooks'
import TestFeatureList from './TestFeatureList'
import Screen, { DockBar, DockRow } from './Screen'
import ChoiceQuiz, { type ChoiceQuestion, type QuizSummary } from './ChoiceQuiz'
import RecordPanel from './RecordPanel'
import ReviewPanel from './ReviewPanel'
import { useQuizRecords } from '../lib/useQuizRecords'
import {
  buildQuiz,
  buildQuestion,
  shuffle,
  makeRng,
  getKukuItems,
  type KukuItem,
} from '../lib/kukuQuiz'
import { loadKukuAbScores, saveKukuAbScores } from '../data/storage'

const RECORDS_KEY = 'kuku999'

const QUIZ_LEN = 10

// ABxC の AB (先頭の2桁) を取り出す。AB ごとの練習/スコアに使う。
const abOf = (it: KukuItem) => it.expr.split('x')[0]

const AB_LIST: string[] = (() => {
  const seen = new Set<string>()
  for (const it of getKukuItems()) seen.add(abOf(it))
  return [...seen].sort((a, b) => Number(a) - Number(b))
})()

const AB_COUNTS: Record<string, number> = (() => {
  const m: Record<string, number> = {}
  for (const it of getKukuItems()) m[abOf(it)] = (m[abOf(it)] || 0) + 1
  return m
})()

/** 指定 AB の全 C を出題。誤答は全体から採って選択肢に変化をつける。 */
function buildAbQuestions(ab: string): ChoiceQuestion[] {
  const pool = getKukuItems().filter((it) => abOf(it) === ab)
  const rng = makeRng(Date.now())
  return shuffle(pool, rng).map((item) => {
    const q = buildQuestion(item, getKukuItems(), rng)
    return { prompt: q.left, answer: q.answer, choices: q.choices }
  })
}

const TIERS = [
  { key: 'easy', label: '易', desc: '足し算なし系 + JI·E0' },
  { key: 'mid', label: '中', desc: 'JI（両位・足し算あり）' },
  { key: 'hard', label: '難', desc: '足し算が繰り上がる +' },
] as const

type TierKey = typeof TIERS[number]['key']

function groupByLabel(items: KukuItem[]) {
  const groups: { label: string; rows: KukuItem[] }[] = []
  for (const it of items) {
    const last = groups[groups.length - 1]
    if (last && last.label === it.label) last.rows.push(it)
    else groups.push({ label: it.label, rows: [it] })
  }
  return groups
}

function chunk<T>(arr: T[], size: number) {
  const out: T[][] = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

/** 左辺読みクイズを組んで ChoiceQuiz 用の設問に変換する */
function buildKukuQuestions(tier: TierKey): ChoiceQuestion[] {
  const pool = getKukuItems().filter((it) => it.tier === tier)
  return buildQuiz(pool, QUIZ_LEN, makeRng(Date.now())).map((q) => ({
    prompt: q.left,
    answer: q.answer,
    choices: q.choices,
  }))
}

type QuizRun = { questions: ChoiceQuestion[]; id: number; ab?: string }

function KukuTab() {
  const [tier, setTier] = useState<TierKey>('easy')
  const [view, setView] = useState<'list' | 'lyrics' | 'ab'>('list')
  const [run, setRun] = useState<QuizRun | null>(null)
  const [summary, setSummary] = useState<QuizSummary | null>(null)
  const [showRecords, setShowRecords] = useState(false)
  const [abScores, setAbScores] = useState(loadKukuAbScores)
  const rec = useQuizRecords(RECORDS_KEY)
  const items = getKukuItems().filter((it) => it.tier === tier)
  const active = TIERS.find((t) => t.key === tier)!

  const startQuiz = useCallback(() => {
    setSummary(null)
    setRun((prev) => ({
      questions: buildKukuQuestions(tier),
      id: (prev?.id ?? 0) + 1,
    }))
  }, [tier])

  const startAbQuiz = useCallback((ab: string) => {
    setSummary(null)
    setRun((prev) => ({
      questions: buildAbQuestions(ab),
      id: (prev?.id ?? 0) + 1,
      ab,
    }))
  }, [])

  const onComplete = useCallback(
    (s: QuizSummary) => {
      setSummary(s)
      if (run?.ab) {
        // AB 別練習は AB キーで best/last を保存する。
        setAbScores((prev) => {
          const before = prev[run.ab!]
          const next = {
            ...prev,
            [run.ab!]: {
              last: s.score,
              best: Math.max(before?.best ?? 0, s.score),
              total: s.total,
              date: new Date().toISOString(),
            },
          }
          saveKukuAbScores(next)
          return next
        })
      } else {
        rec.addRecord(s)
      }
    },
    [rec, run]
  )

  // 全問終了 → summary が入ったら結果オーバーレイを自動表示。閉じるとタブ表示に戻る
  // (年号/年コード/カード/π と同じ流れ)。
  if (run && summary) {
    return (
      <ReviewPanel
        title={run.ab ? `九九 ${run.ab}の段` : '九九 読みテスト'}
        score={summary.score}
        total={summary.total}
        time={summary.time}
        items={summary.reviews}
        onClose={() => {
          setRun(null)
          setSummary(null)
        }}
      />
    )
  }

  if (run) {
    return (
      <ChoiceQuiz
        key={run.id}
        title={
          run.ab ? `九九 ${run.ab}の段` : `九九 読みテスト（${active.label}）`
        }
        questions={run.questions}
        promptClass="kuku-quiz-face"
        onQuit={() => setRun(null)}
        onComplete={onComplete}
      />
    )
  }

  // 一覧・歌詞・AB グリッドとも先頭を下端 (親指側) に置き上へ積む
  const main =
    view === 'list' ? (
      <div class="stack-up">
        {groupByLabel(items).map((g) => (
          // 見出しは節の下端。行は見出しの上へ積む
          <div key={g.label} class="kuku-group stack-up">
            <div class="kuku-group-head">
              <code>{g.label}</code>
              <span class="kuku-group-n">{g.rows.length}</span>
            </div>
            {g.rows.map((r) => (
              <div key={r.expr} class="kuku-row">
                <span class="kuku-expr">{r.expr}</span>
                <span class="kuku-yomi">{r.yomi}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    ) : view === 'lyrics' ? (
      <div class="kuku-lyrics stack-up" style={{ '--stack-gap': '6px' }}>
        {chunk(
          items.map((it) => it.yomi),
          4
        ).map((line, i) => (
          <div key={i} class="kuku-lyric-line">
            {line.join('　')}
          </div>
        ))}
      </div>
    ) : (
      // セル自体が AB 別練習の開始ボタン (一覧の要素なので main に置く)
      <div class="kuku-ab-grid grid-up" style={{ '--cols': 4, '--gap': '8px' }}>
        {AB_LIST.map((ab) => {
          const sc = abScores[ab]
          const ratio = sc ? sc.best / sc.total : -1
          const cls =
            'kuku-ab-cell' +
            (ratio < 0
              ? ''
              : ratio >= 0.9
              ? ' ok'
              : ratio >= 0.6
              ? ' mid'
              : ' low')
          return (
            <button key={ab} class={cls} onClick={() => startAbQuiz(ab)}>
              <span class="kuku-ab-num">{ab}</span>
              <span class="kuku-ab-score">
                {sc ? `${sc.best}/${sc.total}` : `${AB_COUNTS[ab]}問`}
              </span>
            </button>
          )
        })}
      </div>
    )

  const viewButton = (id: typeof view, label: string) => (
    <button
      class={'filter-btn' + (view === id ? ' active' : '')}
      onClick={() => setView(id)}
    >
      {label}
    </button>
  )

  const dock = (
    <>
      <DockBar
        title="九九"
        sub={
          <>
            {items.length}件
            {rec.last ? (
              <span class="dock-rec">
                前回 <b>{rec.last.score}</b>/{rec.last.total}
                {rec.best ? (
                  <>
                    {' '}
                    最高 <b class="is-best">{rec.best.score}</b>/
                    {rec.best.total}
                  </>
                ) : null}
              </span>
            ) : null}
          </>
        }
      />
      <DockRow>
        <span class="dock-row-label">{active.desc}</span>
        {TIERS.map((t) => (
          <button
            key={t.key}
            class={'filter-btn' + (t.key === tier ? ' active' : '')}
            onClick={() => setTier(t.key)}
          >
            {t.label}
          </button>
        ))}
      </DockRow>
      <DockRow>
        {viewButton('list', '一覧')}
        {viewButton('lyrics', '歌詞')}
        {viewButton('ab', 'AB別')}
      </DockRow>
      <TestFeatureList
        features={[
          {
            id: 'kuku-choice',
            title: `読みテスト（${active.label}）`,
            inputMethod: 'choice',
            onStart: startQuiz,
            hasRecords: rec.records.length > 0,
            onShowRecords: () => setShowRecords(true),
          },
        ]}
      />
    </>
  )

  return (
    <>
      <Screen main={main} dock={dock} />
      {showRecords ? (
        <RecordPanel
          title="九九 読みテスト"
          records={rec.records}
          onDelete={rec.deleteRecord}
          onClear={rec.clearRecords}
          onClose={() => setShowRecords(false)}
        />
      ) : null}
    </>
  )
}

export default KukuTab
