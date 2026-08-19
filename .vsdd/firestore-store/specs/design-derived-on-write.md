---
id: design:derived-on-write
title: 派生値の書き込み時再計算
coherence:
  depends_on:
    - design:firestore-schema
---

# design:derived-on-write

`pt` (scorer.js) と `rankey` (rankey.js) は、かな + 語 + 規則表からの純粋な派生値。
現状は生成スクリプトを人が叩く必要があり、実行漏れで古い値が残る事故が繰り返し起きた。
Firestore の書き込みトリガで再計算し、同じドキュメントの `derived` に書く。

## Invariants

- `derived` は `slots` と `rules/*` のみから決まる。他の入力を持たない。
- 同じ入力からは常に同じ `derived` が出る (純粋関数)。
- トリガは自分が書いた `derived` で再帰しない。

## Requirements

- REQ-DRV-001: WHEN `numbers/{num}` の `slots` が変更される THE SYSTEM SHALL 当該番号の `derived` を再計算して書き戻す
- REQ-DRV-002: WHEN `rules/{table}` が変更される THE SYSTEM SHALL 全 `numbers/*` の `derived` を再計算する
- REQ-DRV-003: IF トリガ自身の `derived` 書き込みで再び起動した THEN THE SYSTEM SHALL 何もせず終了する
- REQ-DRV-004: IF かなが空 THEN THE SYSTEM SHALL 当該スロットの `derived` を空にする
- REQ-DRV-005: IF かながエンコード不能 THEN THE SYSTEM SHALL `pt` を `null`・`rankey` を `null` とし、書き込み自体は成功させる
