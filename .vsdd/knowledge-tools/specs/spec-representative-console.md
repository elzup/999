---
id: spec:representative-console
title: 代表語選択ローカルコンソール
coherence:
  depends_on:
    - design:representative-store
---

# spec:representative-console

## Requirements

- **REQ-REP-001 (Ubiquitous):** THE SYSTEM SHALL 000-999 の候補、代表順、確定状態、
  stale 状態、参考スコアを一覧として返す。
- **REQ-REP-002 (Event):** WHEN 有効な番号と候補順を保存する THE SYSTEM SHALL 候補を
  最大 2 件へ正規化し、値ベースの picks と確定状態を永続化する。
- **REQ-REP-003 (Unwanted):** IF 番号が未知またはリクエスト形式が不正 THEN THE SYSTEM
  SHALL 4xx と機械可読な error を返し、ストアを書き換えない。
- **REQ-REP-004 (State):** WHILE コンソールサーバーを起動する THE SYSTEM SHALL
  loopback interface のみで待ち受け、LAN へ書き込み API を公開しない。
- **REQ-REP-005 (Unwanted):** IF 静的ファイル要求が console ディレクトリ外を指す THEN
  THE SYSTEM SHALL 403 を返す。
- **REQ-REP-006 (Event):** WHEN 候補を選択、入替、一括確定する THE SYSTEM SHALL
  保存成功後の順序と確定状態だけを画面 state に反映する。

## Boundaries

- API request body には上限を設ける。
- `num` は 3 桁数字、`order` は既知候補スロットの配列、`confirmed` は boolean とする。
