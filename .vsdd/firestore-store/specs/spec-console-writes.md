---
id: spec:console-writes
title: コンソールからの書き込み
coherence:
  depends_on:
    - design:firestore-schema
    - design:derived-on-write
---

# spec:console-writes

代表語コンソール (:6001) と画像コンソール (:5999) の書き込み先を、
ローカル JSON から `numbers/{num}` に移す。

現状は `writeJson` (tmp→rename) でアトミック性を担保しているが、
ファイルが 1 箇所にしか無いため、外部から巻き戻されると復元できない。

## Invariants

- 代表語 (`rep`) と主観評価 (`ratings`) は独立した軸である。片方の更新が他方を変えない。
- 未評価 (エントリ無し) と `0` (普通) は別状態である。
- 書き込みは 1 番号単位で行い、他の番号に影響しない。

## Requirements

- REQ-CON-001: WHEN 代表語が保存される THE SYSTEM SHALL `rep` のみを更新し `ratings` を変更しない
- REQ-CON-002: WHEN 主観評価が保存される THE SYSTEM SHALL `ratings` のみを更新し `rep` と確定状態を変更しない
- REQ-CON-003: WHEN 評価が `null` で保存される THE SYSTEM SHALL 当該エントリを削除する (0 として保存しない)
- REQ-CON-004: WHEN 画像が確定される THE SYSTEM SHALL 確定時点の語を併せて記録する
- REQ-CON-005: IF 記録された語と現在の語の本体が異なる THEN THE SYSTEM SHALL その画像を要再確認として報告する
