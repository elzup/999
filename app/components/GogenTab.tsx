import { h } from 'preact'
import { useState } from 'preact/hooks'
import { ETYMOLOGY_DATA } from '../data/etymology'

// 語源一覧。「隠す」で語源を伏せ、行タップで 1 件ずつめくって覚える。
function GogenTab() {
  const [isHidden, setIsHidden] = useState(false)
  const [opened, setOpened] = useState<Set<string>>(new Set())

  const toggleHidden = () => {
    setIsHidden((prev) => !prev)
    setOpened(new Set())
  }

  const toggleRow = (word: string) => {
    setOpened((prev) => {
      const next = new Set(prev)
      if (next.has(word)) next.delete(word)
      else next.add(word)
      return next
    })
  }

  return (
    <div class="year-layout">
      <div class="year-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ fontSize: '16px', fontWeight: 'bold' }}>語源</div>
          <div style={{ fontSize: '12px', color: 'var(--text2)' }}>
            {ETYMOLOGY_DATA.length}語
          </div>
          <button
            class={'gogen-hide-btn' + (isHidden ? ' active' : '')}
            onClick={toggleHidden}
          >
            {isHidden ? '表示' : '隠す'}
          </button>
        </div>
      </div>
      <div class="content" style={{ flex: 1, paddingBottom: '4px' }}>
        <div class="gogen-list">
          {ETYMOLOGY_DATA.map((item) => {
            const isOpen = !isHidden || opened.has(item.word)
            return (
              <div
                key={item.word}
                class="gogen-row"
                onClick={isHidden ? () => toggleRow(item.word) : undefined}
              >
                <div class="gogen-head">
                  <span class="gogen-word">{item.word}</span>
                  {item.kana !== item.word ? (
                    <span class="gogen-kana">{item.kana}</span>
                  ) : null}
                </div>
                <div class={'gogen-origin' + (isOpen ? '' : ' hidden')}>
                  {isOpen ? item.origin : '···'}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

export default GogenTab
