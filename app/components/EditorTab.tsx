import { useMemo, useState } from 'preact/hooks'
import type { NumberEntry } from '../data/schema'
import { saveWordPatch, type EditableWordPatch } from '../lib/editorApi'
import { clearEditorToken } from '../lib/editorAuth'

type SlotPrefix = 'wh' | 'wm'

type SlotItem = {
  word: string
  kana: string
  image: string
}

type Draft = {
  hito: string
  mono: string
  gainen: string
  wh: SlotItem[]
  wm: SlotItem[]
}

const SLOT_CONFIG: Array<{ prefix: SlotPrefix; label: string; sheet: string }> =
  [
    { prefix: 'wh', label: 'wh candidates', sheet: 'wh1..wh5' },
    { prefix: 'wm', label: 'wm candidates', sheet: 'wm1..wm5' },
  ]

const HUNDRED_GROUPS = Array.from({ length: 10 }, (_, index) => index)
const MAX_SLOT_COUNT = 5

export default function EditorTab({
  numbers,
  token,
  onSaved,
}: {
  numbers: NumberEntry[]
  token: string
  onSaved: (entry: NumberEntry) => void
}) {
  const [selectedNum, setSelectedNum] = useState(numbers[0]?.num || '000')
  const [jumpValue, setJumpValue] = useState(selectedNum)
  const [group, setGroup] = useState(() => Number(selectedNum[0] || '0'))
  const [tens, setTens] = useState(() => Number(selectedNum[1] || '0'))

  const selected = numbers.find((entry) => entry.num === selectedNum) || null
  const [drafts, setDrafts] = useState(() => createDraftMap(numbers))
  const [status, setStatus] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const numberMap = useMemo(
    () => new Map(numbers.map((entry) => [entry.num, entry])),
    [numbers]
  )
  const decadeNumbers = useMemo(
    () =>
      Array.from({ length: 10 }, (_, index) => {
        const num = `${group}${tens}${index}`
        return numberMap.get(num) || null
      }),
    [group, tens, numberMap]
  )

  function selectNum(num: string) {
    const next = numberMap.get(num)
    if (!next) return
    setGroup(Number(num[0]))
    setTens(Number(num[1]))
    setSelectedNum(num)
    setJumpValue(num)
    setStatus('')
  }

  function selectGroup(nextGroup: number) {
    setGroup(nextGroup)
    setTens(0)
    const firstNum = `${nextGroup}00`
    const next =
      numberMap.get(firstNum) ||
      numbers.find((entry) => entry.num.startsWith(String(nextGroup)))
    if (next) selectNum(next.num)
  }

  function handleJump(value: string) {
    const digits = value.replace(/\D/g, '').slice(0, 3)
    setJumpValue(digits)
    if (digits.length === 3 && numberMap.has(digits)) {
      selectNum(digits)
    }
  }

  async function handleSave() {
    if (!selected || !token) return
    setIsSaving(true)
    setStatus('')

    try {
      const patch = draftToPatch(drafts[selected.num] || createDraft(selected))
      const saved = await saveWordPatch({ num: selected.num, token, patch })
      onSaved(saved)
      setDrafts((prev) => ({
        ...prev,
        [saved.num]: createDraft({ ...selected, ...saved }),
      }))
      setStatus('保存しました')
    } catch (error) {
      setStatus(error instanceof Error ? error.message : '保存に失敗しました')
    } finally {
      setIsSaving(false)
    }
  }

  if (!token) {
    return (
      <main class="content editor-panel">
        <div class="editor-empty">
          <h2>編集 token がありません</h2>
          <p>管理用 URL から開くと、このブラウザに token を保存します。</p>
        </div>
      </main>
    )
  }

  return (
    <main class="content editor-panel">
      <div class="editor-jumpbar">
        <label class="editor-jump-input">
          <span>jump</span>
          <input
            inputMode="numeric"
            pattern="[0-9]*"
            value={jumpValue}
            onInput={(event) => handleJump(event.currentTarget.value)}
          />
        </label>
        <div class="editor-group-tabs">
          {HUNDRED_GROUPS.map((currentGroup) => (
            <button
              key={currentGroup}
              type="button"
              class={
                'editor-group-tab' + (group === currentGroup ? ' active' : '')
              }
              onClick={() => selectGroup(currentGroup)}
            >
              {currentGroup}00
            </button>
          ))}
        </div>
        <div class="editor-decade-tabs">
          {Array.from({ length: 10 }, (_, currentTens) => {
            const num = `${group}${currentTens}0`
            const isActive = tens === currentTens
            return (
              <button
                key={currentTens}
                type="button"
                class={'editor-decade-tab' + (isActive ? ' active' : '')}
                onClick={() => {
                  setTens(currentTens)
                  const next = numberMap.get(num)
                  if (next) selectNum(next.num)
                }}
              >
                {group}
                {currentTens}0
              </button>
            )
          })}
        </div>
      </div>

      <div class="editor-workspace">
        <section class="editor-main-pane">
          <section class="editor-number-pane">
            <div class="editor-pane-head">
              <span>FillAwareNumberGrid</span>
              <div class="editor-legend">
                <span>
                  <i class="ok" />
                  十分
                </span>
                <span>
                  <i class="warn" />
                  片方不足
                </span>
                <span>
                  <i />
                  未入力
                </span>
              </div>
            </div>
            <div class="editor-number-grid">
              {decadeNumbers.map((entry, index) => {
                const num = `${group}${tens}${index}`
                const fill = entry ? getFillState(entry) : null
                return (
                  <button
                    key={num}
                    type="button"
                    class={
                      'editor-num-cell' +
                      (selected?.num === num ? ' active' : '') +
                      (fill?.state ? ` ${fill.state}` : '')
                    }
                    disabled={!entry}
                    onClick={() => selectNum(num)}
                  >
                    <span class="editor-num-main">{num}</span>
                    <span class="editor-num-word">
                      {entry?.wh1 || entry?.w1 || entry?.wm1 || entry?.w2 || ''}
                    </span>
                    {fill && (
                      <span class="editor-fill-bars">
                        <FillLine label="wh" count={fill.whCount} />
                        <FillLine label="wm" count={fill.wmCount} />
                      </span>
                    )}
                  </button>
                )
              })}
            </div>
          </section>

          <section class="editor-form-pane">
            <div class="editor-form-head">
              <div>
                <span class="editor-kicker">JumpEditor</span>
                <h2>
                  {group}
                  {tens}0
                </h2>
                <p>
                  0000 帯の 10 件を一覧で編集します。各ボタンはジャンプです。
                </p>
              </div>
              <button
                class="editor-save-btn"
                onClick={handleSave}
                disabled={isSaving || !selected}
              >
                {isSaving ? '保存中' : '保存'}
              </button>
            </div>

            <div class="editor-compat-note">
              hito / mono / gainen
              と候補は同じフォーム群にまとめています。番号ボタンは選択ではなくジャンプです。
            </div>

            <div class="editor-entry-list">
              {decadeNumbers.map((entry) =>
                entry ? (
                  <EntryEditorCard
                    key={entry.num}
                    entry={entry}
                    draft={drafts[entry.num] || createDraft(entry)}
                    active={entry.num === selectedNum}
                    onChange={(nextDraft) =>
                      setDrafts((prev) => ({ ...prev, [entry.num]: nextDraft }))
                    }
                    onSave={async (nextDraft) => {
                      setIsSaving(true)
                      setStatus('')
                      try {
                        const patch = draftToPatch(nextDraft)
                        const saved = await saveWordPatch({
                          num: entry.num,
                          token,
                          patch,
                        })
                        onSaved(saved)
                        setDrafts((prev) => ({
                          ...prev,
                          [saved.num]: createDraft({ ...entry, ...saved }),
                        }))
                        setStatus(`${entry.num} を保存しました`)
                      } catch (error) {
                        setStatus(
                          error instanceof Error
                            ? error.message
                            : '保存に失敗しました'
                        )
                      } finally {
                        setIsSaving(false)
                      }
                    }}
                  />
                ) : null
              )}
            </div>
          </section>
        </section>
      </div>

      <div class="editor-footer">
        <span class={status.includes('失敗') ? 'editor-error' : ''}>
          {status}
        </span>
        <button
          class="editor-token-clear"
          onClick={() => {
            clearEditorToken()
            location.reload()
          }}
        >
          認証を消去
        </button>
      </div>
    </main>
  )
}

function SlotListEditor({
  prefix,
  label,
  sheet,
  items,
  entry,
  onChange,
}: {
  prefix: SlotPrefix
  label: string
  sheet: string
  items: SlotItem[]
  entry: NumberEntry
  onChange: (items: SlotItem[]) => void
}) {
  function updateItem(index: number, next: SlotItem) {
    onChange(
      items.map((item, currentIndex) => (currentIndex === index ? next : item))
    )
  }

  function addRow() {
    if (items.length >= MAX_SLOT_COUNT) return
    onChange([...items, blankSlotItem()])
  }

  function removeRow(index: number) {
    onChange(items.filter((_, currentIndex) => currentIndex !== index))
  }

  return (
    <div class="editor-candidate-panel">
      <div class="editor-candidate-head">
        <div>
          <h3>{label}</h3>
          <span class="editor-sheet-pill">Sheet: {sheet}</span>
        </div>
        <button
          type="button"
          class="editor-slot-add-btn"
          onClick={addRow}
          disabled={items.length >= MAX_SLOT_COUNT}
        >
          ＋
        </button>
      </div>

      {items.length === 0 && <div class="editor-slot-empty">未設定</div>}

      {items.map((item, index) => {
        const canEditKana = index < 3
        const kanaForMetrics = canEditKana ? item.kana : ''
        const metrics = getKanaMetrics(
          kanaForMetrics,
          index === 0
            ? prefix === 'wh'
              ? entry.w1Score
              : entry.w2Score
            : null,
          index === 0 ? (prefix === 'wh' ? entry.w1Error : entry.w2Error) : null
        )
        const pattern = getPatternLabel(kanaForMetrics)
        return (
          <div class="editor-slot-row" key={index}>
            <span class="editor-priority">
              <small>
                {prefix}
                {index + 1}
              </small>
              <b>{index + 1}</b>
            </span>
            <input
              value={item.word}
              placeholder="word"
              list={`editor-${prefix}-word-options`}
              class="editor-word-input"
              onInput={(event) =>
                updateItem(index, { ...item, word: event.currentTarget.value })
              }
            />
            {canEditKana ? (
              <input
                value={item.kana}
                placeholder="kana"
                maxLength={3}
                class="editor-kana-input"
                onInput={(event) =>
                  updateItem(index, {
                    ...item,
                    kana: event.currentTarget.value,
                  })
                }
              />
            ) : (
              <span class="editor-kana-disabled">kana なし</span>
            )}
            <div class="editor-rule-cell">
              <div class="editor-row-meta">
                <span class="editor-pattern-chip">{pattern}</span>
                <span class="editor-slot-name">
                  {prefix}
                  {index + 1}
                </span>
              </div>
              <div class="editor-rule-summary">
                <span class={scoreClass(metrics.score)}>
                  {metrics.score === null ? '-' : metrics.score}
                </span>
                <span class="editor-rule-chip">{metrics.digits}d</span>
                {metrics.mix && <span class="editor-rule-chip warn">mix</span>}
                {metrics.leadingZeroOmission && (
                  <span class="editor-rule-chip warn">0xx</span>
                )}
                {metrics.hasOverflow && (
                  <span class="editor-rule-chip warn">余り</span>
                )}
                {metrics.youon4 && (
                  <span class="editor-rule-chip warn">youon4</span>
                )}
              </div>
              <div class="editor-flags">
                <span class={'editor-flag ' + flagClass(metrics.status)}>
                  {metrics.status}
                </span>
              </div>
            </div>
            <span
              class={'editor-image-state' + (item.image ? ' manifest' : '')}
            >
              {item.image ? 'manifest' : 'none'}
            </span>
            <button
              type="button"
              class="editor-slot-remove-btn"
              aria-label={`削除 ${index + 1}`}
              onClick={() => removeRow(index)}
            >
              ×
            </button>
          </div>
        )
      })}

      <datalist id={`editor-${prefix}-word-options`}>
        <option value="" />
        {Array.from(new Set(entryWords(entry, prefix))).map((option) => (
          <option key={option} value={option} />
        ))}
      </datalist>
    </div>
  )
}

function EntryEditorCard({
  entry,
  draft,
  active,
  onChange,
  onSave,
}: {
  entry: NumberEntry
  draft: Draft
  active: boolean
  onChange: (draft: Draft) => void
  onSave: (draft: Draft) => Promise<void>
}) {
  return (
    <section class={'editor-entry-card' + (active ? ' active' : '')}>
      <div class="editor-entry-summary">
        <span class="editor-entry-num">{entry.num}</span>
        <span class="editor-entry-headword">
          {entry.wh1 || entry.w1 || entry.hito || '未設定'}
        </span>
        <span class="editor-entry-tags">
          <span class="editor-entry-tag">
            {getPatternLabel(draft.wh[0]?.kana || '')}
          </span>
          <span class="editor-entry-tag">
            {getPatternLabel(draft.wm[0]?.kana || '')}
          </span>
        </span>
        <button class="editor-save-btn" onClick={() => onSave(draft)}>
          保存
        </button>
      </div>

      <div class="editor-entry-body">
        <div class="editor-tag-grid">
          <label class="editor-tag-field">
            <span>hito</span>
            <input
              value={draft.hito}
              placeholder="人の語"
              onInput={(event) =>
                onChange({
                  ...draft,
                  hito: event.currentTarget.value,
                })
              }
            />
          </label>
          <label class="editor-tag-field">
            <span>mono</span>
            <textarea
              value={draft.mono}
              placeholder="物 / #tag"
              rows={2}
              onInput={(event) =>
                onChange({
                  ...draft,
                  mono: event.currentTarget.value,
                })
              }
            />
          </label>
          <label class="editor-tag-field">
            <span>gainen</span>
            <textarea
              value={draft.gainen}
              placeholder="概念 / #tag"
              rows={2}
              onInput={(event) =>
                onChange({
                  ...draft,
                  gainen: event.currentTarget.value,
                })
              }
            />
          </label>
        </div>

        <div class="editor-compat-note">
          候補は wh / wm の 5 列を直接編集し、カナは先頭 3 行だけ保存します。
        </div>

        <div class="editor-edit-list">
          {SLOT_CONFIG.map((config) => (
            <SlotListEditor
              key={config.prefix}
              prefix={config.prefix}
              label={config.label}
              sheet={config.sheet}
              items={draft[config.prefix]}
              entry={entry}
              onChange={(items) =>
                onChange({ ...draft, [config.prefix]: items } as Draft)
              }
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function FillLine({ label, count }: { label: string; count: number }) {
  const width = Math.min(100, count * 20)
  return (
    <span class="editor-fill-line">
      <span>{label}</span>
      <i>
        <b style={{ width: `${width}%` }} />
      </i>
      <em>{count}</em>
    </span>
  )
}

function getFillState(entry: NumberEntry) {
  const whCount = countSlots(entry, 'wh')
  const wmCount = countSlots(entry, 'wm')
  const filledSides = Number(whCount > 0) + Number(wmCount > 0)
  const state =
    filledSides === 2 ? 'complete' : filledSides === 1 ? 'partial' : 'empty'
  return { whCount, wmCount, state }
}

function getKanaMetrics(
  kana: string,
  storedScore: number | null,
  storedError: unknown
) {
  if (!kana) {
    return {
      score: storedScore,
      digits: 0,
      mix: false,
      leadingZeroOmission: false,
      hasOverflow: false,
      youon4: false,
      status: 'kanaなし',
    }
  }

  const hasHira = /[\u3041-\u3096]/.test(kana)
  const hasKata = /[\u30A1-\u30FA]/.test(kana)
  const hasLatin = /[A-Za-z0-9]/.test(kana)
  const mix = (hasHira && hasKata) || hasLatin
  return {
    score: storedScore,
    digits: [...kana].length,
    mix,
    leadingZeroOmission: false,
    hasOverflow: [...kana].length > 3,
    youon4: /[ぁぃぅぇぉゃゅょァィゥェォャュョ]/.test(kana),
    status: storedError ? 'error' : 'kanaあり',
  }
}

function scoreClass(score: number | null | undefined) {
  if (score === null || score === undefined) return 'editor-score empty'
  return 'editor-score' + (score < 30 ? ' warn' : '')
}

function getPatternLabel(kana: string) {
  if (!kana) return '-'
  const tokens = [...kana]
  const hasSokuon = tokens.some((ch) => ch === 'っ' || ch === 'ッ')
  const hasSmall = tokens.some((ch) =>
    /[ぁぃぅぇぉゃゅょァィゥェォャュョ]/.test(ch)
  )
  const base =
    tokens.length >= 4
      ? 'DD+D'
      : tokens.length === 3
      ? hasSmall || hasSokuon
        ? 'DD+D'
        : 'D+D+D'
      : tokens.length === 2
      ? 'D+D'
      : 'D'
  return hasSokuon ? `${base} / っ` : base
}

function flagClass(flag: string) {
  if (flag === 'kanaあり') return 'ok'
  if (
    flag === 'error' ||
    flag === 'kanaなし' ||
    flag === 'no-kana' ||
    flag === 'no-kana-column'
  ) {
    return 'warn'
  }
  if (flag === 'low-score') return 'warn'
  return ''
}

function createDraft(entry?: NumberEntry): Draft {
  return {
    hito: entry?.hito || '',
    mono: entry?.mono || '',
    gainen: entry?.gainen || '',
    wh: readSlotItems(entry, 'wh'),
    wm: readSlotItems(entry, 'wm'),
  }
}

function createDraftMap(numbers: NumberEntry[]) {
  return Object.fromEntries(
    numbers.map((entry) => [entry.num, createDraft(entry)])
  ) as Record<string, Draft>
}

function readSlotItems(
  entry: NumberEntry | undefined,
  prefix: SlotPrefix
): SlotItem[] {
  return Array.from({ length: MAX_SLOT_COUNT }, (_, index) => {
    const slot = index + 1
    return {
      word: readEntryField(entry, `${prefix}${slot}`),
      kana: readEntryField(entry, `${prefix}${slot}k`),
      image: readEntryField(entry, `${prefix}${slot}Img`),
    }
  }).filter((item) => item.word || item.kana || item.image)
}

function readEntryField(
  entry: NumberEntry | undefined,
  key: keyof NumberEntry
) {
  return String(entry?.[key] || '')
}

function draftToPatch(draft: Draft): EditableWordPatch {
  return {
    hito: draft.hito.trim(),
    mono: draft.mono.trim(),
    gainen: draft.gainen.trim(),
    ...serializeSlotPatch('wh', draft.wh),
    ...serializeSlotPatch('wm', draft.wm),
  } as EditableWordPatch
}

function serializeSlotPatch(prefix: SlotPrefix, items: SlotItem[]) {
  const patch: Record<string, string> = {}
  for (let index = 0; index < MAX_SLOT_COUNT; index++) {
    const slot = items[index]
    const slotNo = index + 1
    patch[`${prefix}${slotNo}`] = slot?.word?.trim() || ''
    patch[`${prefix}${slotNo}k`] = slotNo <= 3 ? slot?.kana?.trim() || '' : ''
    patch[`${prefix}${slotNo}Img`] = slot?.image?.trim() || ''
  }
  return patch
}

function countSlots(entry: NumberEntry, prefix: SlotPrefix) {
  return Array.from({ length: MAX_SLOT_COUNT }, (_, index) => index + 1).filter(
    (slot) => readEntryField(entry, `${prefix}${slot}` as keyof NumberEntry)
  ).length
}

function blankSlotItem(): SlotItem {
  return { word: '', kana: '', image: '' }
}

function entryWords(entry: NumberEntry, prefix: SlotPrefix) {
  const words = Array.from({ length: MAX_SLOT_COUNT }, (_, index) =>
    readEntryField(entry, `${prefix}${index + 1}` as keyof NumberEntry)
  ).filter(Boolean)
  return words
}
