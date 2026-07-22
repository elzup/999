---
id: spec:ff-practice
title: FF 一覧と変換練習
coherence:
  depends_on:
    - design:ff-data
    - spec:tab-visibility
---

# spec:ff-practice

## Requirements

- **REQ-FF-001 (Ubiquitous):** THE SYSTEM SHALL 00-FF の読み一覧と 8 bit binary 一覧を
  256 行表示する。
- **REQ-FF-002 (Event):** WHEN 語データを使うテストを開始する THE SYSTEM SHALL
  `hex→語`、`語→hex`、`bin→hex`、`hex→bin` の指定方向で既定 10 問を生成する。
- **REQ-FF-003 (Ubiquitous):** THE SYSTEM SHALL 各 4 択問題に正解をちょうど 1 つ含め、
  選択肢を重複させない。`語→hex` では複数 hex に対応する語を出題対象から除外する。
- **REQ-FF-004 (Event):** WHEN nibble テストを開始する THE SYSTEM SHALL 0-15 の値から
  `bin(4bit)→hex` または `hex→bin(4bit)` の既定 10 問を生成する。
- **REQ-FF-005 (Event):** WHEN キーパッド入力が正解桁数に達する THE SYSTEM SHALL
  1 回だけ採点し、正誤・入力・正解を Review item に記録する。
- **REQ-FF-006 (Event):** WHEN 全問が終了する THE SYSTEM SHALL スコア、総数、経過秒、
  Review item を返し、テスト方向ごとの履歴に保存する。
- **REQ-FF-007 (Unwanted):** IF 語または変換値が欠損記号を含む THEN THE SYSTEM SHALL
  その行を語データ依存テストの出題対象から除外する。

## Boundaries

- 公開される問題生成 API の `count` は 0 以上の整数として扱う。
- nibble の回答は uppercase hex 1 桁または 4 bit binary に正規化する。
