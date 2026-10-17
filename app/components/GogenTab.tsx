import { h } from 'preact'
import { useState } from 'preact/hooks'
import { ETYMOLOGY_DATA } from '../data/etymology'
import Screen, { DockBar } from './Screen'

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

  // 一覧は 1 語目を下端 (親指側) に置き上へ積む
  const main = (
    <div class="gogen-list stack-up">
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
  )

  const dock = (
    <DockBar title="語源" sub={`${ETYMOLOGY_DATA.length}語`}>
      <button
        class={'filter-btn' + (isHidden ? ' active' : '')}
        onClick={toggleHidden}
      >
        {isHidden ? '表示' : '隠す'}
      </button>
    </DockBar>
  )

  return <Screen main={main} dock={dock} />
}

export default GogenTab
