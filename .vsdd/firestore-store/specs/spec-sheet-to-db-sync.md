---
id: spec:sheet-to-db-sync
title: シート → DB の片方向同期
coherence:
  depends_on:
    - design:firestore-schema
---

# spec:sheet-to-db-sync

第 1 段階では同期を **シート → DB の片方向**に限る。双方向化に必要な競合解決と
削除の伝播を後回しにするため。シートは引き続き語・かなの編集面として使える。

DB 側にしか存在しない項目 (`rep` / `ratings` / `derived`) は同期の対象外で、
シート由来の書き込みで**消えてはならない**。これが現状 `nr push` で起きている
事故 (21 列で全上書きして他の列が消える) の裏返しにあたる。

## Invariants

- 同期はシートの語・かな・画像 URL のみを書く。
- `rep` / `ratings` / `derived` / `updatedAt` 以外のフィールドを削除しない。
- 同じシート内容で 2 回流しても結果が変わらない (冪等)。

## Requirements

- REQ-SYN-001: WHEN 同期が実行される THE SYSTEM SHALL シートの各行を `numbers/{num}` の `slots` にマージする
- REQ-SYN-002: WHILE 同期中 THE SYSTEM SHALL 既存の `rep` と `ratings` を保持する
- REQ-SYN-003: IF シートに存在しない `num` が DB にある THEN THE SYSTEM SHALL その番号を削除せず保持する
- REQ-SYN-004: IF シートの行が `/^\d{3}$/` でない THEN THE SYSTEM SHALL その行を無視する
- REQ-SYN-005: WHEN 同期が完了する THE SYSTEM SHALL 変更した番号数と保持した番号数を報告する
- REQ-SYN-006: IF 同一内容で再実行された THEN THE SYSTEM SHALL 書き込みを 0 件にする
