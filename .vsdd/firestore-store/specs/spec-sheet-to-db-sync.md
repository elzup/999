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

- 同期が書くのは **語 (`word`) とかな (`kana`) だけ**。`imageUrl` は書かない。
  シートに `whNImg` 列は実在するが、画像の source of truth は画像パイプライン
  (manifest) 側であり、シートの値は古い写しでしかない。
- `rep` / `ratings` / `imageUrl` を削除も変更もしない。これがこの仕様の最重要点。
- シート行に無いスロットが DB にあっても削除しない (和集合を取る)。
- 同じシート内容で 2 回流しても結果が変わらない (冪等)。

## Requirements

- REQ-SYN-001: WHEN 同期が実行される THE SYSTEM SHALL シートの各行を `numbers/{num}` の `slots` にマージする
- REQ-SYN-002: WHILE 同期中 THE SYSTEM SHALL 既存の `rep` と `ratings` を保持する
- REQ-SYN-003: IF シートに存在しない `num` が DB にある THEN THE SYSTEM SHALL その番号を削除せず保持する
- REQ-SYN-004: IF シートの行が `/^\d{3}$/` でない THEN THE SYSTEM SHALL その行を無視する
- REQ-SYN-005: WHEN 同期が完了する THE SYSTEM SHALL 変更した番号数と保持した番号数を報告する
- REQ-SYN-006: IF 同一内容で再実行された THEN THE SYSTEM SHALL 書き込みを 0 件にする
- REQ-SYN-007: IF 同じ `num` の行がシートに複数ある THEN THE SYSTEM SHALL 衝突として報告し、どちらも書き込まない
- REQ-SYN-008: IF `num` が文字列でない (Sheets API が数値で返す等) THEN THE SYSTEM SHALL 中断せず文字列として解釈する
- REQ-SYN-009: WHEN 書き込みプランを作る THE SYSTEM SHALL 読み取り時の `updatedAt` を添え、適用時の競合検出に使えるようにする
- REQ-SYN-010: WHEN 書き込みプランを作る THE SYSTEM SHALL `derived` を含めない (書き込み口 `writeNumber` が計算する。プランで付けると `validateNumberDoc` が «derived はサーバ所有» として弾く)
