import { useCallback } from 'preact/hooks'
import { BAR_TAB_LABELS, VALID_TABS } from '../data/constants'
import type { TabId } from '../data/constants'
import type { TabVisibility } from '../data/storage'

type Props = {
  visibility: TabVisibility
  onChange: (next: TabVisibility) => void
  onSelectTab: (id: TabId) => void
}

function TabVisibilityPanel({ visibility, onChange, onSelectTab }: Props) {
  const toggle = useCallback(
    (id: TabId) => {
      if (id === 'misc') return
      onChange({ ...visibility, [id]: !visibility[id] })
    },
    [visibility, onChange]
  )

  return (
    <>
      <p class="tab-visibility-desc">
        アプリ下部のタブバーに表示するページを選べます。タップでそのページに移動します。
      </p>
      <div class="tab-visibility-list">
        {VALID_TABS.map((id) => {
          const disabled = id === 'misc'
          const on = visibility[id]
          return (
            <div
              key={id}
              class={'tab-visibility-row' + (disabled ? ' disabled' : '')}
            >
              <button
                type="button"
                class="tab-visibility-open"
                onClick={() => onSelectTab(id)}
              >
                <span class="tab-visibility-info">
                  <span class="tab-visibility-label">{BAR_TAB_LABELS[id]}</span>
                  {disabled && (
                    <span class="tab-visibility-note">常に表示されます</span>
                  )}
                </span>
              </button>
              <button
                type="button"
                class={
                  'toggle-switch' +
                  (on ? ' on' : '') +
                  (disabled ? ' disabled' : '')
                }
                onClick={() => toggle(id)}
                disabled={disabled}
                aria-pressed={on}
                aria-label={`${BAR_TAB_LABELS[id]}を${
                  on ? '非表示' : '表示'
                }にする`}
              >
                <span class="toggle-knob" />
              </button>
            </div>
          )
        })}
      </div>
    </>
  )
}

export default TabVisibilityPanel
