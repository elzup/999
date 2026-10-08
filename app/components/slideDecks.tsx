import { h } from 'preact'
import type { ComponentChildren } from 'preact'
import type { CardEntry, NumberEntry } from '../data/schema'
import { D3_LIST, PI_1000_DIGITS, YEAR_DATA } from '../data/constants'
import { cardValues, formatCardId } from '../data/cards'
import { getFfRows, isValidFfRow } from '../lib/ffQuiz'
import { exprLeft, getKukuItems } from '../lib/kukuQuiz'
import type { SlideDeck } from '../lib/slideDeck'

// 各グループのデータを SlideDeck (問題面 → 答え面) に写す。
// 表示部品はここに閉じ、SlidePlayer には中身を意識させない。

// 数字・記号など短い問題面 (等幅・特大)。
const codeFace = (text: string) => <div class="slide-num">{text}</div>

// 文章の問題面 (出来事名など)。
const textFace = (main: string, sub?: string) => (
  <div class="slide-text">
    <span class="slide-word-main">{main}</span>
    {sub ? <span class="slide-word-kana">{sub}</span> : null}
  </div>
)

const hasWord = (d: NumberEntry) => Boolean(d.wh1 || d.w1 || d.wm1 || d.w2)

function WordRow({
  word,
  kana,
  img,
  isSub,
}: {
  word: string
  kana?: string
  img?: string
  isSub?: boolean
}) {
  return (
    <div class={'slide-word-row' + (isSub ? ' sub' : '')}>
      {img ? (
        <img class="slide-word-img" loading="lazy" src={img} alt={word} />
      ) : null}
      <div class="slide-word-text">
        <span class="slide-word-main">{word}</span>
        {kana ? <span class="slide-word-kana">{kana}</span> : null}
      </div>
    </div>
  )
}

const TAG_LABELS: [key: 'hito' | 'mono' | 'gainen', label: string][] = [
  ['hito', '人'],
  ['mono', '物'],
  ['gainen', '念'],
]

// 数字 1 件ぶんの答え面 (代表語 2 つ + 人/物/念)。数字デッキと π デッキで共有する。
function NumberAnswer({ d }: { d: NumberEntry }) {
  const word1 = d.wh1 || d.w1
  const word2 = d.wm1 || d.w2
  return (
    <>
      <div class="slide-words">
        {word1 ? (
          <WordRow
            word={word1}
            kana={d.wh1k || d.w1k}
            img={d.wh1Img || d.w1Img}
          />
        ) : null}
        {word2 ? (
          <WordRow
            word={word2}
            kana={d.wm1k || d.w2k}
            img={d.wm1Img || d.w2Img}
            isSub
          />
        ) : null}
      </div>
      <div class="slide-tags">
        {TAG_LABELS.filter(([key]) => d[key]).map(([key, label]) => (
          <div key={key} class="detail-chip">
            <span class="dc-label">{label}</span>
            <span class="dc-val">{d[key]}</span>
          </div>
        ))}
      </div>
    </>
  )
}

const labeledRows = (rows: [label: string, value: ComponentChildren][]) => (
  <div class="slide-rows">
    {rows.map(([label, value]) => (
      <div key={label} class="slide-row">
        <span class="slide-row-label">{label}</span>
        <span class="slide-row-val">{value}</span>
      </div>
    ))}
  </div>
)

export function numberDeck(numbers: NumberEntry[]): SlideDeck {
  return {
    id: 'num',
    title: '数字 → 語 スライド',
    items: numbers.filter(hasWord).map((d) => ({
      id: d.num,
      prompt: codeFace(d.num),
      answer: <NumberAnswer d={d} />,
      bmKey: 'n:' + d.num,
    })),
  }
}

export function cardDeck(cards: CardEntry[]): SlideDeck {
  return {
    id: 'card',
    title: 'カード → PAO スライド',
    items: cards.map((card) => ({
      id: card.suit + card.rank,
      prompt: codeFace(formatCardId(card)),
      answer: labeledRows(
        cardValues(card).map(([label, value]) => [label, value])
      ),
      bmKey: 'c:' + card.suit + card.rank,
    })),
  }
}

// π は小数部を 3 桁ずつ区切って覚える (PiTab の 4択と同じ区切り)。
const PI_CHUNK = 3

export function piDeck(numbers: NumberEntry[]): SlideDeck {
  const byNum = new Map(numbers.map((d) => [d.num, d]))
  const decimals = PI_1000_DIGITS.slice(1)
  const chunkCount = Math.floor(decimals.length / PI_CHUNK)
  return {
    id: 'pi',
    title: 'π 桁位置 → 3桁 スライド',
    items: Array.from({ length: chunkCount }, (_, i) => {
      const start = i * PI_CHUNK
      const digits = decimals.slice(start, start + PI_CHUNK).join('')
      const entry = byNum.get(digits)
      return {
        id: String(i),
        prompt: textFace(`${start + 1}-${start + PI_CHUNK}桁`),
        answer: (
          <>
            {codeFace(digits)}
            {entry ? <NumberAnswer d={entry} /> : null}
          </>
        ),
        bmKey: 'n:' + digits,
      }
    }),
  }
}

export function yearDeck(): SlideDeck {
  return {
    id: 'year',
    title: '出来事 → 年号 スライド',
    items: [...YEAR_DATA]
      .sort((a, b) => Number(a.year) - Number(b.year))
      .map((item) => ({
        id: String(item.no),
        prompt: textFace(item.event, item.desc),
        answer: codeFace(item.year),
      })),
  }
}

export function yearCodeDeck(): SlideDeck {
  return {
    id: 'd3',
    title: '年コード XY → Z スライド',
    items: D3_LIST.map((xyz) => ({
      id: xyz,
      prompt: codeFace(xyz.slice(0, 2)),
      answer: codeFace(xyz[2]),
    })),
  }
}

export function kukuDeck(): SlideDeck {
  return {
    id: 'kuku',
    title: '九九 式 → 読み スライド',
    items: getKukuItems().map((item) => ({
      id: item.expr,
      prompt: codeFace(exprLeft(item.expr)),
      answer: textFace(item.prob, item.yomi),
    })),
  }
}

export function ffDeck(): SlideDeck {
  return {
    id: 'ff',
    title: 'hex → 語 スライド',
    items: getFfRows()
      .filter(isValidFfRow)
      .map((row) => ({
        id: row.hex,
        prompt: codeFace(row.hex),
        answer: textFace(row.word || row.kana, `${row.read}・${row.bin}`),
      })),
  }
}
