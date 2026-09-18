---
id: design:memo-target
title: 記憶対象と語の共通モデル
coherence:
  depends_on: []
---

# design:memo-target

数字 (000-999) / カード (52 枚) / hex (00-FF) は、形も置き場所も別々に育った。

| 領域 | 型            | キー          | 語の持ち方                       |
| ---- | ------------- | ------------- | -------------------------------- |
| num  | `NumberEntry` | `num`         | `w1`/`w2` + `wh1..3`/`wm1..3`    |
| card | `CardEntry`   | `suit`+`rank` | `person`/`object`/`action` (PAO) |
| hex  | `FfRow`       | `hex`         | `word`/`kana`                    |

共通の型が無いため「同じ語を別の対象にも割り当てていないか」を領域をまたいで
引けなかった。逆引き (語 → 対象) も存在せず、`spec:ff-practice` は曖昧な語を
出題から外すこと (`UNIQUE_READ_ROWS`) で多対多を避けていた。

`src/data/memo-target.js` は **読み取り側だけの読み替え層** である。TSV・シート・
Firestore の書き込み経路と固定スロットは一切変えない。3 つの形を `DictEntry` の
列に均し、語 → 対象を多対多で引けるようにするのがこの層の役目。

## モデル

- `MemoTarget` — `{ kind: 'num' | 'card' | 'hex', key }`。`targetId` が `num:573` 等を作る
- `DictEntry` — `{ target, role, word, kana, label, name, imageUrl }`
- `role` — 語が置かれる面。`ROLES[kind]` に列挙する。kind ごとに意味が違うので共通語彙にしない
- `label` — 照合に使う語 (`word || kana`)。`name` はタグ・別名・括弧注記を落とした本体
- `buildWordIndex` — `Map<label, DictEntry[]>`。1 語が複数の対象を指せる

## Invariants

- 値が空 (`label === ''`) のスロットは辞書に載らない。
- `targetsOf` が返す対象は重複しない。1 つの対象の複数スロットが同じ語を持っても 1 件に畳む。
- `collisions` は 2 つ以上の対象を指す語だけを、対象の多い順に返す。
- この層は入力を書き換えない (純関数のみ)。
- 欠損値の判定は `src/data/junk.js` だけが持つ。`src/` と `app/` で二重に定義しない。

## Implementation

- `src/data/memo-target.js`
- `src/data/junk.js`
- `src/check-words.js` (`nr check:words`)
- `app/lib/ffQuiz.ts` (逆引きの一意判定に使う)
- `src/ff-reading.js` (欠損判定に使う)

## Requirements

- REQ-MT-001: WHEN 3 領域のいずれかの行を渡す THE SYSTEM SHALL 同じ `DictEntry` の形で語を返す
- REQ-MT-002: THE SYSTEM SHALL 1 つの語から、それを使うすべての対象を領域をまたいで返す
- REQ-MT-003: IF 同じ対象の複数のスロットが同じ語を持つ THEN THE SYSTEM SHALL その対象を 1 件として数える
- REQ-MT-004: WHEN 逆引きの一意性を問われる THE SYSTEM SHALL その語が指す対象が 1 つのときだけ真を返す
- REQ-MT-005: THE SYSTEM SHALL 欠損値の印を 1 箇所で定義し、全体一致と部分一致を区別して判定する
- REQ-MT-006: THE SYSTEM SHALL 書き込み経路・スロット構成・シートの列構成を変更しない
