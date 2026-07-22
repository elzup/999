---
id: design:ff-data
title: 00-FF 学習データ
coherence:
  depends_on: []
---

# design:ff-data

FF 学習データは 0 から 255 までを 1 行ずつ持ち、表示・クイズ・歌詞生成で同じ
読み生成規則を共有する。

## Invariants

- 行数は 256、`hex` は `00` から `FF` まで重複なく昇順で存在する。
- `bin` は同じ値の 8 bit 二進表現である。
- `type` は `NN | NC | CN | CC` のいずれかである。
- `NC/CN` の読みは hex 名読みと参照読みを結合する。
- `NN/CC` の読みは参照、人、物の順で利用可能な値を採用する。
- 語クイズは合成読み `read` ではなく、記憶対象の `word || kana` を回答面に使う。
- `語→hex` は `word || kana` が出題可能行の中で一意な行だけを使い、同じ語が複数 hex
  を指す曖昧な逆引きを出題しない。`hex→語` は重複語を許容する。

## Implementation

- `src/ff-reading.js`
- `scripts/gen-ff-json.mjs`
- `app/data/ff.json`
