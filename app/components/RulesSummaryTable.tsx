import { useState, useMemo } from 'preact/hooks'
import type { RulesData } from '../data/schema'
import { buildRuleSummaryRows } from '../lib/rulesSummary'

type Props = {
  rules: RulesData
}

export function RulesSummaryTable({ rules }: Props) {
  const [hideLong, setHideLong] = useState(false)

  const rows = useMemo(
    () => buildRuleSummaryRows(rules, { hideLong }),
    [rules, hideLong]
  )

  return (
    <div class="rules-section">
      <div class="rules-section-header">
        <div>
          <div class="rules-section-title">1桁・2桁 整理対応表</div>
          <div class="rules-section-desc">
            各数字の1桁かなと、その数字から始まる2桁かなの対応一覧（単一ルールソースから自動生成）。
          </div>
        </div>
        <div class="rules-summary-controls">
          <button
            type="button"
            class={'rules-switch-btn' + (!hideLong ? ' active' : '')}
            onClick={() => setHideLong(false)}
          >
            長音あり
          </button>
          <button
            type="button"
            class={'rules-switch-btn' + (hideLong ? ' active' : '')}
            onClick={() => setHideLong(true)}
          >
            長音なし
          </button>
        </div>
      </div>

      <div class="rules-summary-table-wrap">
        <table class="rules-summary-table">
          <thead>
            <tr>
              <th class="col-1d-num">1桁</th>
              <th class="col-1d-kana">かな</th>
              <th class="col-2d-num">2桁</th>
              <th class="col-2d-kana">かな</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr
                key={`${row.digit}-${idx}`}
                class={row.isFirstInGroup ? 'group-first' : ''}
              >
                <td
                  class={
                    'cell-1d-num' +
                    (row.isFirstInGroup ? ' primary' : ' secondary')
                  }
                >
                  {row.singleDigitLabel}
                </td>
                <td class="cell-1d-kana">
                  {row.single ? (
                    <span
                      class={'rules-tier-badge rules-tier-' + row.single.tier}
                      title={`tier: ${row.single.tier}`}
                    >
                      {row.single.kana}
                    </span>
                  ) : (
                    <span class="rules-cell-empty">—</span>
                  )}
                </td>
                <td class="cell-2d-num">
                  {row.double ? (
                    row.double.num
                  ) : (
                    <span class="rules-cell-empty">—</span>
                  )}
                </td>
                <td class="cell-2d-kana">
                  {row.double ? (
                    <span class="rules-double-items">
                      {row.double.kanas.map((k, kIdx) => (
                        <span
                          key={kIdx}
                          class={
                            'rules-double-item' + (k.isLong ? ' is-long' : '')
                          }
                          title={k.isLong ? '長音' : undefined}
                        >
                          {k.kana}
                          {k.isLong && <span class="rules-long-badge">長</span>}
                        </span>
                      ))}
                    </span>
                  ) : (
                    <span class="rules-cell-empty">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default RulesSummaryTable
