import { useState, useCallback } from 'preact/hooks'
import kukuData from '../data/kuku.json'
import TestFeatureList from './TestFeatureList'
import ChoiceQuiz, { type ChoiceQuestion, type QuizSummary } from './ChoiceQuiz'
import RecordPanel from './RecordPanel'
import ReviewPanel from './ReviewPanel'
import { useQuizRecords } from '../lib/useQuizRecords'
import { buildQuiz, makeRng, type KukuItem } from '../lib/kukuQuiz'

const RECORDS_KEY = 'kuku999'

const ITEMS = kukuData as KukuItem[]
const QUIZ_LEN = 10

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
  const pool = ITEMS.filter((it) => it.tier === tier)
  return buildQuiz(pool, QUIZ_LEN, makeRng(Date.now())).map((q) => ({
    prompt: q.left,
    answer: q.answer,
    choices: q.choices,
  }))
}

type QuizRun = { questions: ChoiceQuestion[]; id: number }

function KukuTab() {
  const [tier, setTier] = useState<TierKey>('easy')
  const [view, setView] = useState<'list' | 'lyrics'>('list')
  const [run, setRun] = useState<QuizRun | null>(null)
  const [summary, setSummary] = useState<QuizSummary | null>(null)
  const [showRecords, setShowRecords] = useState(false)
  const rec = useQuizRecords(RECORDS_KEY)
  const items = ITEMS.filter((it) => it.tier === tier)
  const active = TIERS.find((t) => t.key === tier)!

  const startQuiz = useCallback(() => {
    setSummary(null)
    setRun((prev) => ({
      questions: buildKukuQuestions(tier),
      id: (prev?.id ?? 0) + 1,
    }))
  }, [tier])

  const onComplete = useCallback(
    (s: QuizSummary) => {
      setSummary(s)
      rec.addRecord(s)
    },
    [rec]
  )

  // 全問終了 → summary が入ったら結果オーバーレイを自動表示。閉じるとタブ表示に戻る
  // (年号/年コード/カード/π と同じ流れ)。
  if (run && summary) {
    return (
      <ReviewPanel
        title="九九 読みテスト"
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
        title={`九九 読みテスト（${active.label}）`}
        questions={run.questions}
        promptClass="kuku-quiz-face"
        onQuit={() => setRun(null)}
        onComplete={onComplete}
      />
    )
  }

  return (
    <>
      <div class="kuku-header">
        <div class="kuku-title">
          九九 <span class="kuku-count">{items.length}件</span>
        </div>
        <div class="kuku-tiers">
          {TIERS.map((t) => (
            <button
              key={t.key}
              class={'kuku-tier-btn' + (t.key === tier ? ' active' : '')}
              onClick={() => setTier(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div class="kuku-sub">
          <span class="kuku-desc">{active.desc}</span>
          <div class="kuku-views">
            <button
              class={'kuku-view-btn' + (view === 'list' ? ' active' : '')}
              onClick={() => setView('list')}
            >
              一覧
            </button>
            <button
              class={'kuku-view-btn' + (view === 'lyrics' ? ' active' : '')}
              onClick={() => setView('lyrics')}
            >
              歌詞
            </button>
          </div>
        </div>
        <div class="kuku-test">
          <TestFeatureList
            compact
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
          {rec.last ? (
            <div class="kuku-record-line">
              前回 <b>{rec.last.score}</b>/{rec.last.total}
              {rec.best ? (
                <>
                  {' '}
                  最高 <b style={{ color: 'var(--warn)' }}>{rec.best.score}</b>/
                  {rec.best.total}
                </>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <div class="content kuku-content">
        {view === 'list' ? (
          groupByLabel(items).map((g) => (
            <div key={g.label} class="kuku-group">
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
          ))
        ) : (
          <div class="kuku-lyrics">
            {chunk(
              items.map((it) => it.yomi),
              4
            ).map((line, i) => (
              <div key={i} class="kuku-lyric-line">
                {line.join('　')}
              </div>
            ))}
          </div>
        )}
      </div>
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
