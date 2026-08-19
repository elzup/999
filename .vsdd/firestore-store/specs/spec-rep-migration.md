---
id: spec:rep-migration
title: word-rep.json の移行
coherence:
  depends_on:
    - design:firestore-schema
    - spec:sheet-to-db-sync
---

# spec:rep-migration

`src/data/word-rep.json` は代表語と主観評価を持つが、**シートに写しが無く**
ローカル 1 箇所にしか存在しない。実際にこの作業中、git の巻き戻し操作で
数件を失い復元できなかった。これを `numbers/{num}` に移す。

保存形式は現行と同じ「読み + 語の値」を維持する。スロット位置で持つと
候補の並び替えでズレるため (design:representative-store と同じ理由)。

## Invariants

- 移行は既存の `word-rep.json` を変更しない (読み取り専用)。
- 移行後の `rep` / `ratings` の件数は移行前と一致する。
- 値が現在の候補に解決できない場合も、値そのものは捨てない。

## Requirements

- REQ-MIG-001: WHEN 移行が実行される THE SYSTEM SHALL `word-rep.json` の `rep` を `numbers/{num}.rep` に写す
- REQ-MIG-002: WHEN 移行が実行される THE SYSTEM SHALL `word-rep.json` の `scores` を `numbers/{num}.ratings` に写す
- REQ-MIG-003: IF 移行元の値が現在の候補に一致しない THEN THE SYSTEM SHALL その値を保持したまま stale として記録する
- REQ-MIG-004: WHEN 移行が完了する THE SYSTEM SHALL 移行前後の件数を照合し、不一致なら異常終了する
- REQ-MIG-005: IF 移行先に既に `rep` がある THEN THE SYSTEM SHALL 上書きせず中止する
