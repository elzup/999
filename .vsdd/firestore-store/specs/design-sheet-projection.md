---
id: design:sheet-projection
title: DB → シートの投影
coherence:
  depends_on:
    - design:firestore-schema
    - spec:sheet-to-db-sync
---

# design:sheet-projection

第 1 段階では同期を「シート → DB」の片方向に限った。正本を Firestore に移すと
向きが逆になるが、**シートを捨てるわけではない**。一覧して直接打つ編集面としては
シートが今も一番速く、`check` 列の式や既存の運用がその上に乗っている。

そこで DB を正本に、**シートを人が読み書きする副本**として投影で追随させる。

## 上書き事故を繰り返さないこと

`nr push` は 21 列を全上書きして `rankey` / `check` を消した前例がある
(README の「`push` が列を消す」)。投影は同じ形にしてはならない。書くのは
DB が正本として持つセルだけで、式セルと派生列には触れない。

## 競合の扱い

シート側の人手編集と DB 側の編集が同じセルに当たると、後から流れた方が勝つ。
これを黙って起こさないため、投影は **読んだ時点のセル値**を添えて書く。
現在値が読んだ値と違えば、それは投影が知らない編集なので書かずに報告する。
`spec:sheet-to-db-sync` の REQ-SYN-009 が `updatedAt` を添えているのと同じ考え方。

## Invariants

- 投影が書くのは語 (ラベルを含む語文字列) とかなだけ。`rankey` / `check` / `pt` の
  式セルと派生列には書かない。
- シートに存在しない番号の行を作らない。行の追加は投影の責務ではない。
- 同じ内容を 2 回投影しても書き込みは 0 件 (冪等)。
- 投影は 1 番号単位で行い、他の番号のセルに影響しない。
- 投影の失敗は DB の書き込みを巻き戻さない。DB が正本であり、シートは追随する側。

## Requirements

- REQ-PRJ-001: WHEN DB の語またはかなが変わる THE SYSTEM SHALL 該当番号の行の対応セルだけを更新する
- REQ-PRJ-002: WHILE 投影中 THE SYSTEM SHALL 式セルと派生列 (`rankey` / `check` / `pt`) を書き換えない
- REQ-PRJ-003: IF シートの現在値が投影の読み取り時点と異なる THEN THE SYSTEM SHALL 書き込まず衝突として報告する
- REQ-PRJ-004: IF 対象の `num` の行がシートに無い THEN THE SYSTEM SHALL 行を作らず未反映として報告する
- REQ-PRJ-005: IF 同一内容で再実行された THEN THE SYSTEM SHALL 書き込みを 0 件にする
- REQ-PRJ-006: IF 投影が失敗した THEN THE SYSTEM SHALL DB の内容を巻き戻さず、未投影の番号を再試行できる形で残す
- REQ-PRJ-007: WHEN 投影が完了する THE SYSTEM SHALL 投影した番号数と衝突した番号数を報告する
