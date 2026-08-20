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

**別の onWrite トリガにはせず、書き込み経路の中で計算する。**
REQ-FS-006 により全ての書き込みが Function 1 箇所を通るため、そこで
`withDerived` を通せば必ず最新になる。トリガを分けると (a) 自分の書き込みで
再帰する危険、(b) 書き込みと再計算の間に古い値が読める瞬間、(c) コード経路が
2 つに増える、という 3 つの不利があり、分ける利点が無い。

そのため当初の REQ-DRV-003 (再帰ガード) は不要になった。

## Invariants

- `derived` は `num` と `slots` と `rules/*` のみから決まる。他の入力を持たない。
  (`rankey` は先頭0省略と中間省略の判定に `num` を要する。実データ 1940 件のうち
  20 件で `num` の有無により結果が変わる)
- 同じ入力からは常に同じ `derived` が出る (純粋関数)。
- 呼び出し元が渡した `derived` は必ず捨てる (信用しない)。

## Requirements

- REQ-DRV-001: WHEN `numbers/{num}` が書き込まれる THE SYSTEM SHALL 永続化の前に `derived` を再計算して差し替える
- REQ-DRV-002: WHEN `rules/{table}` が変更される THE SYSTEM SHALL 全 `numbers/*` の `derived` を再計算する一括処理を提供する
- REQ-DRV-003: WHEN 呼び出し元が `derived` を含む文書を渡す THE SYSTEM SHALL その値を捨てて計算し直す
- REQ-DRV-004: IF かなが空 THEN THE SYSTEM SHALL 当該スロットの `derived` を空にする
- REQ-DRV-005: IF かながエンコード不能 THEN THE SYSTEM SHALL `pt` を `null`・`rankey` を `null` とし、書き込み自体は成功させる
- REQ-DRV-006: IF `num` が 3 桁でない THEN THE SYSTEM SHALL 計算せず例外を投げる (誤った値を黙って書かない)
