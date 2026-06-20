import { h } from 'preact'
import { useState, useMemo } from 'preact/hooks'
import type { NumberEntry, RulesData } from '../data/schema'
import type { Combo, ReadingPart } from '../lib/recallTree'
import { buildRecallTree } from '../lib/recallTree'

type Props = {
  numbers: NumberEntry[]
  rules: RulesData
}

function KanaChip({ part }: { part: ReadingPart }) {
  const cls =
    part.tier === 'double' ? 'recall-chip-double' : 'rules-tier-' + part.tier
  return <span class={'recall-chip ' + cls}>{part.kana}</span>
}

function ComboRow({ combo }: { combo: Combo }) {
  return (
    <div class={'recall-combo' + (combo.examples.length > 0 ? ' has-ex' : '')}>
      <div class="recall-combo-kana">
        {combo.parts.map((p, i) => (
          <KanaChip key={i} part={p} />
        ))}
      </div>
      <div class="recall-combo-flags">
        {combo.type === 'double' && <span class="recall-flag dbl">2文字</span>}
        {combo.mix && <span class="recall-flag mix">mix</span>}
      </div>
      <div class="recall-combo-ex">
        {combo.examples.length > 0 ? (
          combo.examples.map((e) => (
            <span key={e.num} class="recall-ex">
              {e.word}
              <span class="recall-ex-num">{e.num}</span>
            </span>
          ))
        ) : (
          <span class="recall-ex-none">—</span>
        )}
      </div>
    </div>
  )
}

function RecallTreePanel({ numbers, rules }: Props) {
  const [input, setInput] = useState('200')
  const tree = useMemo(
    () => buildRecallTree(input, rules, numbers),
    [input, rules, numbers]
  )

  return (
    <div class="content recall-panel">
      <div class="recall-input-row">
        <label class="recall-input-label">番号</label>
        <input
          class="recall-input"
          type="text"
          inputMode="numeric"
          maxLength={3}
          value={input}
          onInput={(e) =>
            setInput((e.target as HTMLInputElement).value.replace(/\D/g, ''))
          }
          placeholder="000-999"
        />
      </div>

      {!tree ? (
        <div class="recall-empty">3桁の番号を入力してください</div>
      ) : (
        <>
          <div class="recall-summary">
            <span class="recall-num">{tree.num}</span>
            <span class="recall-head">
              先頭 {tree.head.digit}:
              {tree.head.readings.map((r, i) => (
                <KanaChip key={i} part={r} />
              ))}
            </span>
            {(tree.assigned?.w1 || tree.assigned?.w2) && (
              <span class="recall-assigned">
                登録: <b>{tree.assigned.w1 || tree.assigned.w2}</b>
                <span class="recall-assigned-k">
                  {tree.assigned.w1k || tree.assigned.w2k}
                </span>
              </span>
            )}
          </div>

          <div class="recall-section-title">
            登録分布（下2桁 <b>{tree.tail}</b> の {tree.dist.total} 語）
          </div>
          <div class="recall-dist">
            {tree.dist.items.map((d) => (
              <span key={d.kana} class="recall-dist-item">
                <span class="recall-dist-kana">{d.kana}</span>
                <span class="recall-dist-count">{d.count}</span>
              </span>
            ))}
            {tree.dist.other > 0 && (
              <span class="recall-dist-item other">
                <span class="recall-dist-kana">融合/他</span>
                <span class="recall-dist-count">{tree.dist.other}</span>
              </span>
            )}
            {tree.dist.unregistered > 0 && (
              <span class="recall-dist-item none">
                <span class="recall-dist-kana">未登録</span>
                <span class="recall-dist-count">{tree.dist.unregistered}</span>
              </span>
            )}
          </div>

          <div class="recall-section-title">
            下2桁 <b>{tree.tail}</b> の読み（tier 高い順）
          </div>
          <div class="recall-combo-list">
            <div class="recall-combo head">
              <div class="recall-combo-kana">読み</div>
              <div class="recall-combo-flags"></div>
              <div class="recall-combo-ex">例（同じ下2桁の語）</div>
            </div>
            {tree.combos.map((c) => (
              <ComboRow key={c.kana} combo={c} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export default RecallTreePanel
